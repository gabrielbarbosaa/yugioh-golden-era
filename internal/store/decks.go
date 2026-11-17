package store

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/golden-era/api/internal/deck"
)

// ErrForbidden indica que o recurso existe, mas pertence a outro usuário.
var ErrForbidden = errors.New("sem permissão")

// DeckOwner identifica o dono de um deck.
type DeckOwner struct {
	ID        string
	Username  string
	AvatarURL *string
}

// DeckSummary é o deck sem a lista de cartas.
type DeckSummary struct {
	ID          string
	Name        string
	Archetype   *string
	Visibility  string
	CoverCardID *int64
	// CoverImagePath é o caminho relativo da imagem pequena da capa (nulo sem capa).
	CoverImagePath *string
	LikeCount      int
	CommentCount   int
	LikedByMe      bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Owner          DeckOwner
}

// Deck é o deck completo. Infos traz os dados das cartas para calcular estatísticas.
type Deck struct {
	DeckSummary
	Description string
	Cards       deck.Cards
	Infos       map[int64]deck.CardInfo
}

// DeckInput é o conteúdo gravado em criação, edição e cópia.
type DeckInput struct {
	Name        string
	Description string
	Archetype   *string
	Visibility  string
	CoverCardID *int64
	Cards       deck.Cards
}

// DeckSort define a ordenação (e o formato do cursor) de uma listagem.
type DeckSort string

// Ordenações disponíveis.
const (
	SortPopular DeckSort = "popular" // mais curtidos primeiro
	SortRecent  DeckSort = "recent"  // criados há menos tempo primeiro
	SortUpdated DeckSort = "updated" // editados há menos tempo primeiro
)

// DeckFilter reúne os filtros de listagem.
type DeckFilter struct {
	Sort          DeckSort
	Archetype     *string
	Query         string
	OwnerID       *string // só decks deste usuário
	OwnerUsername *string // idem, pelo username
	PublicOnly    bool    // true: ignora decks privados (inclusive os do dono)
	ViewerID      string  // quem está vendo (para likedByMe); vazio = anônimo
}

// DeckCursor marca o último deck devolvido.
type DeckCursor struct {
	Likes int       `json:"l,omitempty"`
	Time  time.Time `json:"t,omitempty"`
	ID    string    `json:"i"`
}

// Decks acessa decks e suas cartas.
type Decks struct{ pool *pgxpool.Pool }

// NewDecks devolve o acesso a decks usando o pool informado.
func NewDecks(pool *pgxpool.Pool) *Decks { return &Decks{pool: pool} }

const summarySelect = `
SELECT d.id::text, d.name, d.archetype, d.visibility, d.cover_card_id, d.like_count, d.comment_count,
       d.created_at, d.updated_at, u.id::text, u.username::text, u.avatar_url,
       COALESCE(EXISTS (SELECT 1 FROM deck_likes l WHERE l.deck_id = d.id AND l.user_id = $1::uuid), false),
       cv.image_small_path
FROM decks d JOIN users u ON u.id = d.owner_id
LEFT JOIN cards cv ON cv.id = d.cover_card_id`

func scanSummary(row pgx.Row) (DeckSummary, error) {
	var s DeckSummary
	err := row.Scan(&s.ID, &s.Name, &s.Archetype, &s.Visibility, &s.CoverCardID, &s.LikeCount, &s.CommentCount,
		&s.CreatedAt, &s.UpdatedAt, &s.Owner.ID, &s.Owner.Username, &s.Owner.AvatarURL, &s.LikedByMe, &s.CoverImagePath)
	return s, err
}

// viewerParam devolve nil (NULL) para visitantes anônimos.
func viewerParam(id string) any {
	if id == "" {
		return nil
	}
	return id
}

// Create grava um deck novo e devolve o id.
func (s *Decks) Create(ctx context.Context, ownerID string, in DeckInput) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO decks (owner_id, name, description, archetype, visibility, cover_card_id)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
		ownerID, in.Name, in.Description, in.Archetype, in.Visibility, in.CoverCardID).Scan(&id)
	if err != nil {
		return "", err
	}
	if err := insertCards(ctx, tx, id, in.Cards); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

// Replace substitui nome, descrição, visibilidade e cartas. Só o dono pode.
func (s *Decks) Replace(ctx context.Context, id, ownerID string, in DeckInput) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := lockOwned(ctx, tx, id, ownerID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE decks SET name=$2, description=$3, archetype=$4, visibility=$5, cover_card_id=$6, updated_at=now()
		WHERE id=$1`, id, in.Name, in.Description, in.Archetype, in.Visibility, in.CoverCardID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM deck_cards WHERE deck_id=$1`, id); err != nil {
		return err
	}
	if err := insertCards(ctx, tx, id, in.Cards); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Delete remove o deck. Só o dono pode.
func (s *Decks) Delete(ctx context.Context, id, ownerID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if err := lockOwned(ctx, tx, id, ownerID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM decks WHERE id=$1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// lockOwned trava a linha do deck e confere o dono: ErrNotFound se não existe, ErrForbidden se é de outro.
func lockOwned(ctx context.Context, tx pgx.Tx, id, ownerID string) error {
	var owner string
	err := tx.QueryRow(ctx, `SELECT owner_id::text FROM decks WHERE id=$1 FOR UPDATE`, id).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidUUID(err) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if owner != ownerID {
		return ErrForbidden
	}
	return nil
}

func insertCards(ctx context.Context, tx pgx.Tx, deckID string, c deck.Cards) error {
	var rows [][]any
	for zone, entries := range map[string][]deck.Entry{"main": c.Main, "extra": c.Extra, "side": c.Side} {
		for _, e := range entries {
			rows = append(rows, []any{deckID, e.CardID, zone, e.Quantity})
		}
	}
	if len(rows) == 0 {
		return nil
	}
	_, err := tx.CopyFrom(ctx, pgx.Identifier{"deck_cards"},
		[]string{"deck_id", "card_id", "zone", "quantity"}, pgx.CopyFromRows(rows))
	return err
}

// Get devolve o deck completo se o visitante puder vê-lo (público ou dono); senão ErrNotFound.
func (s *Decks) Get(ctx context.Context, id, viewerID string) (Deck, error) {
	sum, err := scanSummary(s.pool.QueryRow(ctx, summarySelect+` WHERE d.id = $2::uuid`, viewerParam(viewerID), id))
	if errors.Is(err, pgx.ErrNoRows) || isInvalidUUID(err) {
		return Deck{}, ErrNotFound
	}
	if err != nil {
		return Deck{}, err
	}
	if sum.Visibility != "public" && sum.Owner.ID != viewerID {
		return Deck{}, ErrNotFound // não revela que o deck privado existe
	}

	d := Deck{DeckSummary: sum, Infos: map[int64]deck.CardInfo{}}
	if err := s.pool.QueryRow(ctx, `SELECT description FROM decks WHERE id=$1`, id).Scan(&d.Description); err != nil {
		return Deck{}, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT dc.zone, dc.card_id, dc.quantity, c.name, c.type, c.level, c.is_extra_deck
		FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
		WHERE dc.deck_id = $1 ORDER BY c.name, dc.card_id`, id)
	if err != nil {
		return Deck{}, err
	}
	defer rows.Close()
	d.Cards = deck.Cards{Main: []deck.Entry{}, Extra: []deck.Entry{}, Side: []deck.Entry{}}
	for rows.Next() {
		var (
			zone string
			e    deck.Entry
			ci   deck.CardInfo
		)
		if err := rows.Scan(&zone, &e.CardID, &e.Quantity, &ci.Name, &ci.Type, &ci.Level, &ci.IsExtraDeck); err != nil {
			return Deck{}, err
		}
		d.Infos[e.CardID] = ci
		switch zone {
		case "main":
			d.Cards.Main = append(d.Cards.Main, e)
		case "extra":
			d.Cards.Extra = append(d.Cards.Extra, e)
		case "side":
			d.Cards.Side = append(d.Cards.Side, e)
		}
	}
	return d, rows.Err()
}

// List devolve uma página de decks. A segunda resposta indica se há mais páginas.
func (s *Decks) List(ctx context.Context, f DeckFilter, after *DeckCursor, limit int) ([]DeckSummary, bool, error) {
	args := []any{viewerParam(f.ViewerID)}
	var where []string
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "$$", "$"+strconv.Itoa(len(args))))
	}
	if f.PublicOnly {
		where = append(where, "d.visibility = 'public'")
	}
	if f.OwnerID != nil {
		add("d.owner_id = $$::uuid", *f.OwnerID)
	}
	if f.OwnerUsername != nil {
		add("u.username = $$", *f.OwnerUsername)
	}
	if f.Archetype != nil {
		add("d.archetype = $$", *f.Archetype)
	}
	if f.Query != "" {
		add("d.name ILIKE '%' || $$ || '%' ESCAPE '\\'", escapeLike(f.Query))
	}

	var order string
	switch f.Sort {
	case SortRecent:
		order = "d.created_at DESC, d.id ASC"
		if after != nil {
			args = append(args, after.Time, after.ID)
			n := strconv.Itoa(len(args))
			where = append(where, "(d.created_at < $"+strconv.Itoa(len(args)-1)+" OR (d.created_at = $"+strconv.Itoa(len(args)-1)+" AND d.id > $"+n+"::uuid))")
		}
	case SortUpdated:
		order = "d.updated_at DESC, d.id ASC"
		if after != nil {
			args = append(args, after.Time, after.ID)
			n := strconv.Itoa(len(args))
			where = append(where, "(d.updated_at < $"+strconv.Itoa(len(args)-1)+" OR (d.updated_at = $"+strconv.Itoa(len(args)-1)+" AND d.id > $"+n+"::uuid))")
		}
	default:
		order = "d.like_count DESC, d.id ASC"
		if after != nil {
			args = append(args, after.Likes, after.ID)
			n := strconv.Itoa(len(args))
			where = append(where, "(d.like_count < $"+strconv.Itoa(len(args)-1)+" OR (d.like_count = $"+strconv.Itoa(len(args)-1)+" AND d.id > $"+n+"::uuid))")
		}
	}

	sql := summarySelect
	if len(where) > 0 {
		sql += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit+1)
	sql += " ORDER BY " + order + " LIMIT $" + strconv.Itoa(len(args))

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var out []DeckSummary
	for rows.Next() {
		sum, err := scanSummary(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, sum)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	return out, more, nil
}

// UserExists informa se existe um usuário com o username.
func (s *Decks) UserExists(ctx context.Context, username string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE username = $1)`, username).Scan(&ok)
	return ok, err
}

// Copy duplica um deck visível ao usuário como um deck privado dele. Devolve o id da cópia.
func (s *Decks) Copy(ctx context.Context, srcID, userID string) (string, error) {
	src, err := s.Get(ctx, srcID, userID)
	if err != nil {
		return "", err
	}
	name := "Cópia de " + src.Name
	if r := []rune(name); len(r) > deck.MaxNameLen {
		name = string(r[:deck.MaxNameLen])
	}
	return s.Create(ctx, userID, DeckInput{
		Name:        name,
		Description: src.Description,
		Archetype:   src.Archetype,
		Visibility:  "private",
		CoverCardID: src.CoverCardID,
		Cards:       src.Cards,
	})
}

func isInvalidUUID(err error) bool {
	return err != nil && strings.Contains(err.Error(), "invalid input syntax for type uuid")
}
