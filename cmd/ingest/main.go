// Comando ingest baixa as cartas da era configurada (e suas imagens) para a pasta local .data.
//
// Uso (a partir de apps/api):
//
//	go run ./cmd/ingest                    # cartas + imagens
//	go run ./cmd/ingest -image-limit 20    # teste rápido com 20 cartas
//	go run ./cmd/ingest -skip-fetch        # reaproveita cards.json e só baixa imagens pendentes
//	go run ./cmd/ingest -images=false      # só os dados
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/golden-era/api/internal/ingest"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "erro:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		out        = flag.String("out", ".data", "pasta de saída")
		region     = flag.String("region", env("ERA_REGION", "ocg"), "região do corte: ocg ou tcg")
		start      = flag.String("start", env("ERA_START_DATE", "1999-01-01"), "data inicial (YYYY-MM-DD)")
		end        = flag.String("end", env("ERA_END_DATE", "2003-12-31"), "data final (YYYY-MM-DD)")
		baseURL    = flag.String("base-url", ingest.DefaultBaseURL, "base da API do YGOPRODeck")
		skipFetch  = flag.Bool("skip-fetch", false, "não consulta a API; reaproveita cards.json existente")
		images     = flag.Bool("images", true, "baixar as imagens")
		imageLimit = flag.Int("image-limit", 0, "baixar imagens só das N primeiras cartas (0 = todas)")
		rps        = flag.Float64("rps", 4, "downloads de imagem por segundo (máx. 10)")
	)
	flag.Parse()

	era := ingest.Era{Region: *region, Start: *start, End: *end}
	if err := era.Validate(); err != nil {
		return err
	}
	if *rps <= 0 || *rps > 10 {
		return fmt.Errorf("-rps deve estar entre 0 e 10 (a API bloqueia o IP acima de 20 req/s)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client := ingest.NewClient(*baseURL)
	cardsPath := filepath.Join(*out, "cards.json")

	var cards []ingest.Card
	if *skipFetch {
		f, err := ingest.ReadCardsFile(cardsPath)
		if err != nil {
			return fmt.Errorf("lendo %s: %w", cardsPath, err)
		}
		cards = f.Cards
		era = f.Era
		fmt.Printf("Reaproveitando %s (%d cartas)\n", cardsPath, len(cards))
	} else {
		fmt.Printf("Buscando cartas (%s, %s a %s)…\n", era.Region, era.Start, era.End)
		api, err := client.Cards(ctx, era)
		if err != nil {
			return fmt.Errorf("buscando cartas: %w", err)
		}
		cards = ingest.ToCards(api)

		file := ingest.CardsFile{
			GeneratedAt: time.Now().UTC(),
			Source:      *baseURL + "/cardinfo.php",
			Era:         era,
			Cards:       cards,
		}
		if err := ingest.WriteJSON(cardsPath, file); err != nil {
			return err
		}
		fmt.Println("Gravado:", cardsPath)

		sets, err := client.Sets(ctx)
		if err != nil {
			return fmt.Errorf("buscando sets: %w", err)
		}
		setsPath := filepath.Join(*out, "sets.json")
		if err := ingest.WriteJSON(setsPath, sets); err != nil {
			return err
		}
		fmt.Printf("Gravado: %s (%d sets)\n", setsPath, len(sets))
	}

	report := ingest.BuildReport(cards, era)
	fmt.Println()
	fmt.Print(report.String())
	if err := os.WriteFile(filepath.Join(*out, "report.txt"), []byte(report.String()), 0o644); err != nil {
		return err
	}

	if !*images {
		fmt.Println("\nImagens ignoradas (-images=false).")
		return nil
	}

	dl := &ingest.Downloader{
		Client:   client,
		Dir:      filepath.Join(*out, "images"),
		Interval: time.Duration(float64(time.Second) / *rps),
	}
	fmt.Printf("\nBaixando imagens para %s (%.1f/s, retomável)…\n", dl.Dir, *rps)
	res, err := dl.Run(ctx, cards, *imageLimit, func(done, total int) {
		if done%100 == 0 || done == total {
			fmt.Printf("  %d/%d\n", done, total)
		}
	})
	fmt.Printf("Imagens: %d baixadas, %d já existiam, %d falharam\n", res.Downloaded, res.Skipped, len(res.Failed))
	if len(res.Failed) > 0 {
		failedPath := filepath.Join(*out, "failed_images.txt")
		var content string
		for _, u := range res.Failed {
			content += u + "\n"
		}
		_ = os.WriteFile(failedPath, []byte(content), 0o644)
		fmt.Println("Lista das falhas em", failedPath, "(rode de novo com -skip-fetch para tentar outra vez)")
	}
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return errors.New("interrompido; rode de novo com -skip-fetch para continuar de onde parou")
		}
		return err
	}
	return nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
