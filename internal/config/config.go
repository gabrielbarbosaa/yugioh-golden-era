// Package config carrega a configuração do serviço a partir de variáveis de ambiente.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// Config reúne tudo o que o serviço precisa para subir.
type Config struct {
	Addr            string
	LogLevel        slog.Level
	ShutdownTimeout time.Duration
	Version         string

	DatabaseURL  string
	ImagesDir    string // pasta com as imagens baixadas pelo comando de ingestão
	ImageBaseURL string // prefixo público das URLs de imagem devolvidas pela API
	EraEndDate   string // fim da era (YYYY-MM-DD); filtra os sets listados
}

// Load lê o ambiente aplicando valores padrão adequados ao desenvolvimento local.
func Load(version string) (Config, error) {
	port := getenv("PORT", "8080")
	cfg := Config{
		Addr:            ":" + port,
		ShutdownTimeout: 10 * time.Second,
		Version:         version,
		DatabaseURL:     getenv("DATABASE_URL", "postgres://golden:golden@localhost:5432/golden_era?sslmode=disable"),
		ImagesDir:       getenv("IMAGES_DIR", ".data/images"),
		ImageBaseURL:    strings.TrimRight(getenv("IMAGE_BASE_URL", "http://localhost:"+port+"/images"), "/"),
		EraEndDate:      getenv("ERA_END_DATE", "2003-12-31"),
	}
	if _, err := time.Parse(time.DateOnly, cfg.EraEndDate); err != nil {
		return Config{}, fmt.Errorf("ERA_END_DATE inválida %q: %w", cfg.EraEndDate, err)
	}

	level := strings.ToLower(getenv("LOG_LEVEL", "info"))
	if err := cfg.LogLevel.UnmarshalText([]byte(level)); err != nil {
		return Config{}, fmt.Errorf("LOG_LEVEL inválido %q: %w", level, err)
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
