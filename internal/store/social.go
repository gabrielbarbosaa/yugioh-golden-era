package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrSelfFollow indica a tentativa de seguir a si mesmo.
var ErrSelfFollow = errors.New("não é possível seguir a si mesmo")

// Comment é um comentário em um deck.
type Comment struct {
	ID        string
	Body      string
	CreatedAt time.Time
	Author    DeckOwner
}

// CommentCursor marca o último comentário devolvido (ordem: mais novo primeiro).
type CommentCursor struct {
	Time time.Time `json:"t"`
	ID   string    `json:"i"`
}

// Social acessa curtidas, comentários e seguidores.
type Social struct{ pool *pgxpool.Pool }

// NewSocial devolve o acesso às funções sociais usando o pool informado.
func NewSocial(pool *pgxpool.Pool) *Social { return &Social{pool: pool} }

// Like registra a curtida (idempotente). Só decks públicos podem ser curtidos; senão ErrNotFound.
// A inserção e o ajuste do contador acontecem no mesmo comando, então não há corrida.
func (s *Social) Like(ctx context.Context, deckID, userID string) error {
	var one int
	err := s.pool.QueryRow(ctx, `
		WITH ins AS (
		  INSERT INTO deck_likes (deck_id, user_id)
		  SELECT d.id, $2::uuid FROM decks d WHERE d.id = $1::uuid AND d.visibility = 'public'
		  ON CONFLICT DO NOTHING RETURNING 1
		)
		UPDATE decks SET like_count = like_count + (SELECT count(*) FROM ins)
		WHERE id = $1::uuid AND visibility = 'public' RETURNING 1`, deckID, userID).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidUUID(err) {
		return ErrNotFound
	}
	return err
}

// Unlike remove a curtida (idempotente; não falha se ela não existia).
func (s *Social) Unlike(ctx context.Context, deckID, userID string) error {
	_, err := s.pool.Exec(ctx, `
		WITH del AS (DELETE FROM deck_likes WHERE deck_id = $1::uuid AND user_id = $2::uuid RETURNING 1)
		UPDATE decks SET like_count = like_count - (SELECT count(*) FROM del) WHERE id = $1::uuid`, deckID, userID)
	if isInvalidUUID(err) {
		return nil
	}
	return err
}

// ListComments devolve os comentários de um deck público, do mais novo para o mais antigo.
func (s *Social) ListComments(ctx context.Context, deckID string, after *CommentCursor, limit int) ([]Comment, bool, error) {
	if ok, err := s.publicDeckExists(ctx, deckID); err != nil || !ok {
		if err == nil {
			err = ErrNotFound
		}
		return nil, false, err
	}
	args := []any{deckID, limit + 1}
	cond := ""
	if after != nil {
		args = append(args, after.Time, after.ID)
		cond = " AND (c.created_at < $3 OR (c.created_at = $3 AND c.id < $4::uuid))"
	}
	rows, err := s.pool.Query(ctx, `
		SELECT c.id::text, c.body, c.created_at, u.id::text, u.username::text, u.avatar_card_id, (SELECT ca.image_small_path FROM cards ca WHERE ca.id = u.avatar_card_id)
		FROM comments c JOIN users u ON u.id = c.author_id
		WHERE c.deck_id = $1::uuid`+cond+`
		ORDER BY c.created_at DESC, c.id DESC LIMIT $2`, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var out []Comment
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.Body, &c.CreatedAt, &c.Author.ID, &c.Author.Username, &c.Author.AvatarCardID, &c.Author.AvatarPath); err != nil {
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

// CreateComment comenta em um deck público e atualiza o contador; ErrNotFound se não for público.
func (s *Social) CreateComment(ctx context.Context, deckID, authorID, body string) (Comment, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Comment{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var c Comment
	err = tx.QueryRow(ctx, `
		WITH d AS (
		  UPDATE decks SET comment_count = comment_count + 1
		  WHERE id = $1::uuid AND visibility = 'public' RETURNING id
		), c AS (
		  INSERT INTO comments (deck_id, author_id, body) SELECT id, $2::uuid, $3 FROM d
		  RETURNING id, body, created_at, author_id
		)
		SELECT c.id::text, c.body, c.created_at, u.id::text, u.username::text, u.avatar_card_id, (SELECT ca.image_small_path FROM cards ca WHERE ca.id = u.avatar_card_id)
		FROM c JOIN users u ON u.id = c.author_id`, deckID, authorID, body).
		Scan(&c.ID, &c.Body, &c.CreatedAt, &c.Author.ID, &c.Author.Username, &c.Author.AvatarCardID, &c.Author.AvatarPath)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidUUID(err) {
		return Comment{}, ErrNotFound
	}
	if err != nil {
		return Comment{}, err
	}
	return c, tx.Commit(ctx)
}

func (s *Social) publicDeckExists(ctx context.Context, deckID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM decks WHERE id = $1::uuid AND visibility = 'public')`, deckID).Scan(&ok)
	if isInvalidUUID(err) {
		return false, nil
	}
	return ok, err
}

// Follow faz followerID seguir o usuário com o username dado (idempotente).
// ErrNotFound se o usuário não existe; ErrSelfFollow se for o próprio.
func (s *Social) Follow(ctx context.Context, followerID, username string) error {
	var followeeID string
	err := s.pool.QueryRow(ctx, `SELECT id::text FROM users WHERE username = $1`, username).Scan(&followeeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if followeeID == followerID {
		return ErrSelfFollow
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, followerID, followeeID)
	return err
}

// Unfollow deixa de seguir (idempotente; usuário inexistente também resulta em sucesso).
func (s *Social) Unfollow(ctx context.Context, followerID, username string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM follows WHERE follower_id = $1
		AND followee_id = (SELECT id FROM users WHERE username = $2)`, followerID, username)
	return err
}
