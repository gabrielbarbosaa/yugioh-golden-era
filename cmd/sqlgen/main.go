// Comando sqlgen transforma .data/cards.json e .data/sets.json em um script SQL de importação
// (.data/import.sql) para o PostgreSQL.
//
// Uso (a partir de apps/api):
//
//	go run ./cmd/sqlgen
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/golden-era/api/internal/ingest"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "erro:", err)
		os.Exit(1)
	}
}

func run() error {
	dir := flag.String("data", ".data", "pasta com cards.json e sets.json")
	outPath := flag.String("out", "", "arquivo de saída (padrão: <data>/import.sql)")
	apply := flag.Bool("apply", false, "além de gerar o arquivo, executa o import no banco de DATABASE_URL")
	flag.Parse()

	if *outPath == "" {
		*outPath = filepath.Join(*dir, "import.sql")
	}

	cf, err := ingest.ReadCardsFile(filepath.Join(*dir, "cards.json"))
	if err != nil {
		return fmt.Errorf("%w (rode antes: go run ./cmd/ingest)", err)
	}
	sets, err := ingest.ReadSetsFile(filepath.Join(*dir, "sets.json"))
	if err != nil {
		return fmt.Errorf("%w (rode antes: go run ./cmd/ingest)", err)
	}

	f, err := os.Create(*outPath)
	if err != nil {
		return err
	}
	stats, werr := ingest.WriteImportSQL(f, cf.Cards, sets)
	if cerr := f.Close(); werr == nil {
		werr = cerr
	}
	if werr != nil {
		return werr
	}

	fmt.Printf("Gravado: %s\n  %d cartas, %d sets, %d impressões\n", *outPath, stats.Cards, stats.Sets, stats.Prints)

	if *apply {
		return applyToDB(*outPath)
	}
	return nil
}

// applyToDB executa o script (idempotente, com BEGIN/COMMIT próprios) no banco de DATABASE_URL.
func applyToDB(path string) error {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://golden:golden@localhost:5432/golden_era?sslmode=disable"
	}
	script, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return fmt.Errorf("conectando ao banco (docker compose up -d --wait?): %w", err)
	}
	defer conn.Close(ctx)
	// Sem argumentos, o pgx usa o protocolo simples e aceita o script com vários comandos.
	if _, err := conn.Exec(ctx, string(script)); err != nil {
		return fmt.Errorf("executando %s: %w", path, err)
	}
	fmt.Println("Importado no banco.")
	return nil
}
