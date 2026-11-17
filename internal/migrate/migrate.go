// Package migrate aplica as migrations embutidas (goose) no PostgreSQL.
package migrate

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/golden-era/api/migrations"
)

// Up aplica todas as migrations pendentes e devolve a versão final do schema.
func Up(ctx context.Context, databaseURL string) (int64, error) {
	cfg, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return 0, fmt.Errorf("DATABASE_URL inválida: %w", err)
	}
	db := stdlib.OpenDB(*cfg)
	defer db.Close()

	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations.FS)
	if err != nil {
		return 0, err
	}
	if _, err := provider.Up(ctx); err != nil {
		return 0, fmt.Errorf("aplicando migrations: %w", err)
	}
	return provider.GetDBVersion(ctx)
}
