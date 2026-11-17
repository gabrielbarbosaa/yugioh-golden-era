// Comando api sobe o servidor HTTP do Golden Era.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/golden-era/api/internal/auth"
	"github.com/golden-era/api/internal/config"
	"github.com/golden-era/api/internal/httpapi"
	"github.com/golden-era/api/internal/migrate"
	"github.com/golden-era/api/internal/store"
)

// version é preenchida no build com -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		slog.Error("falha fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(version)
	if err != nil {
		return err
	}

	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	if cfg.JWTSecret == config.DevJWTSecret {
		log.Warn("usando JWT_SECRET de desenvolvimento; defina JWT_SECRET em produção")
	}

	eraEnd, _ := time.Parse(time.DateOnly, cfg.EraEndDate) // já validada em config.Load

	dbCtx, cancelDB := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelDB()
	if cfg.MigrateOnStart {
		version, err := migrate.Up(dbCtx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		log.Info("migrations aplicadas", "version", version)
	}
	pool, err := pgxpool.New(dbCtx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("conectando ao banco: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(dbCtx); err != nil {
		return fmt.Errorf("banco indisponível (docker compose up -d --wait?): %w", err)
	}

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: httpapi.NewHandler(log, cfg.Version, httpapi.Deps{
			Cards:        store.NewCards(pool),
			Users:        store.NewUsers(pool),
			Decks:        store.NewDecks(pool),
			Social:       store.NewSocial(pool),
			Collection:   store.NewCollection(pool),
			Tokens:       auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL),
			ImagesDir:    cfg.ImagesDir,
			ImageBaseURL: cfg.ImageBaseURL,
			EraEnd:       eraEnd,
			CORSOrigins:  cfg.CORSOrigins,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		log.Info("servidor iniciado", "addr", cfg.Addr, "version", cfg.Version)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("encerrando servidor")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return err
		}
	}
	return nil
}
