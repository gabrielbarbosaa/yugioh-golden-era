package store

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CollectionItem é uma carta da coleção pessoal e quantas cópias o usuário tem.
type CollectionItem struct {
	CardID   int64
	Quantity int
}

// Collection acessa a coleção pessoal de cartas.
type Collection struct{ pool *pgxpool.Pool }

// NewCollection devolve o acesso à coleção usando o pool informado.
func NewCollection(pool *pgxpool.Pool) *Collection { return &Collection{pool: pool} }

// Get devolve a coleção do usuário ordenada pelo passcode.
func (s *Collection) Get(ctx context.Context, userID string) ([]CollectionItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT card_id, quantity FROM collection_items WHERE user_id = $1 ORDER BY card_id`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (CollectionItem, error) {
		var it CollectionItem
		err := r.Scan(&it.CardID, &it.Quantity)
		return it, err
	})
}

// Replace troca a coleção inteira numa transação. Itens com quantidade 0 não são gravados.
func (s *Collection) Replace(ctx context.Context, userID string, items []CollectionItem) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `DELETE FROM collection_items WHERE user_id = $1`, userID); err != nil {
		return err
	}
	rows := make([][]any, 0, len(items))
	for _, it := range items {
		if it.Quantity > 0 {
			rows = append(rows, []any{userID, it.CardID, it.Quantity})
		}
	}
	if len(rows) > 0 {
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"collection_items"},
			[]string{"user_id", "card_id", "quantity"}, pgx.CopyFromRows(rows)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
