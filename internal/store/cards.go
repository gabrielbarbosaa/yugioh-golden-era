// Package store concentra o acesso ao PostgreSQL.
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

// ErrNotFound indica que o registro pedido não existe.
var ErrNotFound = errors.New("não encontrado")

// Card é uma carta do catálogo.
type Card struct {
	ID             int64
	Name           string
	Type           string
	FrameType      string
	Desc           string
	ATK, DEF       *int
	Level          *int
	Race           *string
	Attribute      *string
	Archetype      *string
	OCGDate        *time.Time
	TCGDate        *time.Time
	ImagePath      string
	ImageSmallPath string
}

// CardSet é um set de cartas.
type CardSet struct {
	Code       string
	Name       string
	OCGDate    *time.Time
	TCGDate    *time.Time
	NumOfCards int
}

// CardFilter reúne os filtros de busca. Campos nulos não filtram.
type CardFilter struct {
	Query     string
	Type      *string
	Attribute *string
	Race      *string
	Level     *int
	Archetype *string
}

// CardCursor marca a última carta devolvida; a ordenação é por (nome, id).
type CardCursor struct {
	Name string `json:"n"`
	ID   int64  `json:"i"`
}

// Cards acessa as tabelas do catálogo.
type Cards struct{ pool *pgxpool.Pool }

// NewCards devolve o acesso ao catálogo usando o pool informado.
func NewCards(pool *pgxpool.Pool) *Cards { return &Cards{pool: pool} }

const cardColumns = `id, name, type, frame_type, description, atk, def, level, race, attribute,
	archetype, ocg_date, tcg_date, image_path, image_small_path`

func scanCard(row pgx.Row) (Card, error) {
	var c Card
	err := row.Scan(&c.ID, &c.Name, &c.Type, &c.FrameType, &c.Desc, &c.ATK, &c.DEF, &c.Level,
		&c.Race, &c.Attribute, &c.Archetype, &c.OCGDate, &c.TCGDate, &c.ImagePath, &c.ImageSmallPath)
	return c, err
}

// List devolve até limit cartas após o cursor. A segunda resposta indica se há mais páginas.
func (s *Cards) List(ctx context.Context, f CardFilter, after *CardCursor, limit int) ([]Card, bool, error) {
	var (
		where []string
		args  []any
	)
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "$$", "$"+strconv.Itoa(len(args))))
	}
	if f.Query != "" {
		add("name ILIKE '%' || $$ || '%' ESCAPE '\\'", escapeLike(f.Query))
	}
	if f.Type != nil {
		add("type = $$", *f.Type)
	}
	if f.Attribute != nil {
		add("attribute = $$", *f.Attribute)
	}
	if f.Race != nil {
		add("race = $$", *f.Race)
	}
	if f.Level != nil {
		add("level = $$", *f.Level)
	}
	if f.Archetype != nil {
		add("archetype = $$", *f.Archetype)
	}
	if after != nil {
		args = append(args, after.Name, after.ID)
		where = append(where, "(name, id) > ($"+strconv.Itoa(len(args)-1)+", $"+strconv.Itoa(len(args))+")")
	}

	sql := "SELECT " + cardColumns + " FROM cards"
	if len(where) > 0 {
		sql += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit+1) // um a mais para saber se há próxima página
	sql += " ORDER BY name, id LIMIT $" + strconv.Itoa(len(args))

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var out []Card
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, c)
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

// Get devolve uma carta pelo passcode.
func (s *Cards) Get(ctx context.Context, id int64) (Card, error) {
	c, err := scanCard(s.pool.QueryRow(ctx, "SELECT "+cardColumns+" FROM cards WHERE id = $1", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Card{}, ErrNotFound
	}
	return c, err
}

// Infos devolve os dados das cartas pedidas que existem no catálogo (as ausentes ficam de fora).
func (s *Cards) Infos(ctx context.Context, ids []int64) (map[int64]deck.CardInfo, error) {
	out := make(map[int64]deck.CardInfo, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT id, name, type, level, is_extra_deck FROM cards WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			id int64
			ci deck.CardInfo
		)
		if err := rows.Scan(&id, &ci.Name, &ci.Type, &ci.Level, &ci.IsExtraDeck); err != nil {
			return nil, err
		}
		out[id] = ci
	}
	return out, rows.Err()
}

// Archetypes lista os arquétipos presentes no catálogo, em ordem alfabética.
func (s *Cards) Archetypes(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT archetype FROM cards WHERE archetype IS NOT NULL AND archetype <> '' ORDER BY archetype`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// Sets lista os sets lançados (TCG ou OCG) até a data informada, do mais antigo para o mais novo.
func (s *Cards) Sets(ctx context.Context, until time.Time) ([]CardSet, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT code, name, ocg_date, tcg_date, num_of_cards FROM card_sets
		 WHERE COALESCE(ocg_date, tcg_date) <= $1
		 ORDER BY COALESCE(ocg_date, tcg_date), code`, until)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (CardSet, error) {
		var c CardSet
		err := r.Scan(&c.Code, &c.Name, &c.OCGDate, &c.TCGDate, &c.NumOfCards)
		return c, err
	})
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
