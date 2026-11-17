// Comando banlist gera internal/banlist/ocg.json: lê data/banlist/ocg-2003-10.txt (nomes e limites),
// resolve cada nome para o passcode no catálogo do Postgres e grava o JSON embutido na API.
// Se algum nome não existir no catálogo (ou casar com mais de uma carta) o comando falha sem gravar nada.
//
//	go run ./cmd/banlist            # usa DATABASE_URL (padrão: o Postgres do docker compose)
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/golden-era/api/internal/banlist"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "erro:", err)
		os.Exit(1)
	}
}

func run() error {
	src := flag.String("src", "data/banlist/ocg-2003-10.txt", "arquivo-fonte com os nomes")
	out := flag.String("out", "internal/banlist/ocg.json", "JSON gerado")
	dsn := flag.String("db", getenv("DATABASE_URL", "postgres://golden:golden@localhost:5432/golden_era?sslmode=disable"), "DATABASE_URL")
	flag.Parse()

	f, err := os.Open(*src)
	if err != nil {
		return err
	}
	defer f.Close()
	entries, err := banlist.ParseSource(f)
	if err != nil {
		return fmt.Errorf("%s: %w", *src, err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, *dsn)
	if err != nil {
		return err
	}
	defer pool.Close()

	var cards []banlist.Card
	var problems []string
	for _, e := range entries {
		rows, err := pool.Query(ctx, `SELECT id, name FROM cards WHERE lower(name) = lower($1)`, e.Name)
		if err != nil {
			return err
		}
		var matches []banlist.Card
		for rows.Next() {
			c := banlist.Card{MaxCopies: e.MaxCopies}
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
			cards = append(cards, matches[0])
		case 0:
			problems = append(problems, fmt.Sprintf("não existe no catálogo: %q", e.Name))
		default:
			problems = append(problems, fmt.Sprintf("%q casa com %d cartas", e.Name, len(matches)))
		}
	}
	if len(problems) > 0 {
		for _, p := range problems {
			fmt.Fprintln(os.Stderr, "-", p)
		}
		return fmt.Errorf("%d nome(s) sem correspondência única; nada foi gravado", len(problems))
	}

	// Ordem estável (limite, depois nome): o JSON só muda no git quando a lista muda de verdade.
	sort.Slice(cards, func(i, j int) bool {
		if cards[i].MaxCopies != cards[j].MaxCopies {
			return cards[i].MaxCopies < cards[j].MaxCopies
		}
		return cards[i].Name < cards[j].Name
	})
	list := banlist.List{
		Name:          "OCG - outubro de 2003",
		Format:        "OCG",
		EffectiveFrom: "2003-10-15",
		Source:        "Yugipedia, October 2003 Lists (OCG)",
		Cards:         cards,
	}
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(*out, append(b, '\n'), 0o644); err != nil {
		return err
	}
	fmt.Printf("%d cartas gravadas em %s\n", len(cards), *out)
	return nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
