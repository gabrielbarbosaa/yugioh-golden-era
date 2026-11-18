// Comando animedecks gera internal/animedecks/decks.json: lê data/anime-decks/*.txt (nomes e quantidades), resolve
// cada nome para o passcode no catálogo do Postgres e grava o JSON embutido na API.
// Carta que não existe no catálogo da era vai para a lista `missing` do deck (não é erro: o anime usou cartas
// posteriores à era). Nome que casa com mais de uma carta falha sem gravar nada.
//
//	go run ./cmd/animedecks            # usa DATABASE_URL (padrão: o Postgres do docker compose)
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/golden-era/api/internal/animedecks"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "erro:", err)
		os.Exit(1)
	}
}

func run() error {
	srcDir := flag.String("src", "data/anime-decks", "pasta com os arquivos-fonte (*.txt)")
	out := flag.String("out", "internal/animedecks/decks.json", "JSON gerado")
	dsn := flag.String("db", getenv("DATABASE_URL", "postgres://golden:golden@localhost:5432/golden_era?sslmode=disable"), "DATABASE_URL")
	flag.Parse()

	files, err := filepath.Glob(filepath.Join(*srcDir, "*.txt"))
	if err != nil || len(files) == 0 {
		return fmt.Errorf("nenhum .txt em %s", *srcDir)
	}
	sort.Strings(files)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, *dsn)
	if err != nil {
		return err
	}
	defer pool.Close()

	var decks []animedecks.Deck
	var problems []string
	for _, file := range files {
		f, err := os.Open(file)
		if err != nil {
			return err
		}
		src, err := animedecks.ParseSource(f)
		f.Close()
		if err != nil {
			return fmt.Errorf("%s: %w", file, err)
		}
		d := animedecks.Deck{Slug: src.Slug, Character: src.Character, Series: src.Series, Description: src.Description, Cards: []animedecks.Card{}, Missing: []string{}}
		for _, e := range src.Entries {
			rows, err := pool.Query(ctx, `SELECT id, name FROM cards WHERE lower(name) = lower($1)`, e.Name)
			if err != nil {
				return err
			}
			var matches []animedecks.Card
			for rows.Next() {
				c := animedecks.Card{Quantity: e.Quantity}
				if err := rows.Scan(&c.CardID, &c.Name); err != nil {
					rows.Close()
					return err
				}
				matches = append(matches, c)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
			switch len(matches) {
			case 1:
				d.Cards = append(d.Cards, matches[0])
			case 0:
				d.Missing = append(d.Missing, e.Name)
			default:
				problems = append(problems, fmt.Sprintf("%s: %q casa com %d cartas", file, e.Name, len(matches)))
			}
		}
		// Capa: a carta indicada (se existir no deck) ou a primeira.
		if len(d.Cards) > 0 {
			d.CoverCardID = d.Cards[0].CardID
			for _, c := range d.Cards {
				if src.Cover != "" && strings.EqualFold(c.Name, src.Cover) {
					d.CoverCardID = c.CardID
				}
			}
		}
		decks = append(decks, d)
		fmt.Printf("%-10s %2d cartas encontradas, %d ausentes %v\n", d.Slug, len(d.Cards), len(d.Missing), d.Missing)
	}
	if len(problems) > 0 {
		for _, p := range problems {
			fmt.Fprintln(os.Stderr, "-", p)
		}
		return fmt.Errorf("%d nome(s) ambíguo(s); nada foi gravado", len(problems))
	}

	b, err := json.MarshalIndent(animedecks.Collection{Decks: decks}, "", "  ")
	if err != nil {
		return err
	}
	if _, err := animedecks.Parse(b); err != nil { // nunca grava um JSON que a API recusaria
		return err
	}
	return os.WriteFile(*out, append(b, '\n'), 0o644)
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}