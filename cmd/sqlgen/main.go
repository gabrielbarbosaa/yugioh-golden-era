// Comando sqlgen transforma .data/cards.json e .data/sets.json em um script SQL de importação
// (.data/import.sql) para o PostgreSQL.
//
// Uso (a partir de apps/api):
//
//	go run ./cmd/sqlgen
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

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
	return nil
}
