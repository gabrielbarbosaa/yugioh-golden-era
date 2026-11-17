// Package config carrega a configuração do serviço a partir de variáveis de ambiente.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
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

	JWTSecret  string
	AccessTTL  time.Duration
	RefreshTTL time.Duration

	MigrateOnStart bool // aplica as migrations ao subir (MIGRATE_ON_START=true)

	CORSOrigins []string // CORS_ORIGINS, separadas por vírgula; padrão: Expo web e Next.js em dev

	// TrustProxy (TRUST_PROXY=true) usa o primeiro IP de X-Forwarded-For como IP do cliente nos limites de uso.
	// Ligue só se a API está atrás de um proxy que sobrescreve esse cabeçalho; senão qualquer um forja o próprio IP.
	TrustProxy bool
}

// DevJWTSecret é o segredo padrão de desenvolvimento; nunca use em produção.
const DevJWTSecret = "dev-only-secret-change-me-0123456789abcdef"

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
		JWTSecret:       getenv("JWT_SECRET", DevJWTSecret),
	}
	for _, o := range strings.Split(getenv("CORS_ORIGINS", "http://localhost:8081,http://localhost:19006,http://localhost:3000"), ",") {
		if o = strings.TrimSpace(o); o != "" { // "a, b" com espaço ou vírgula sobrando não pode virar uma origem inválida
			cfg.CORSOrigins = append(cfg.CORSOrigins, o)
		}
	}
	var err error
	if cfg.MigrateOnStart, err = strconv.ParseBool(getenv("MIGRATE_ON_START", "false")); err != nil {
		return Config{}, fmt.Errorf("MIGRATE_ON_START inválido: %w", err)
	}
	if cfg.TrustProxy, err = strconv.ParseBool(getenv("TRUST_PROXY", "false")); err != nil {
		return Config{}, fmt.Errorf("TRUST_PROXY inválido: %w", err)
	}
	if cfg.AccessTTL, err = time.ParseDuration(getenv("ACCESS_TOKEN_TTL", "15m")); err != nil {
		return Config{}, fmt.Errorf("ACCESS_TOKEN_TTL inválido: %w", err)
	}
	if cfg.RefreshTTL, err = time.ParseDuration(getenv("REFRESH_TOKEN_TTL", "720h")); err != nil {
		return Config{}, fmt.Errorf("REFRESH_TOKEN_TTL inválido: %w", err)
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET deve ter pelo menos 32 caracteres")
	}
	// Quem declara produção não pode subir com o segredo público de desenvolvimento (qualquer um forjaria tokens).
	if strings.EqualFold(getenv("APP_ENV", ""), "production") && cfg.JWTSecret == DevJWTSecret {
		return Config{}, fmt.Errorf("APP_ENV=production exige um JWT_SECRET próprio (o padrão de desenvolvimento não é aceito)")
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
