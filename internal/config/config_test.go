package config

import "testing"

func TestLoadRejectsDevSecretInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", DevJWTSecret)
	if _, err := Load("test"); err == nil {
		t.Fatal("esperava erro: segredo de desenvolvimento em produção")
	}

	t.Setenv("JWT_SECRET", "um-segredo-proprio-com-mais-de-32-caracteres")
	if _, err := Load("test"); err != nil {
		t.Fatalf("segredo próprio deve ser aceito em produção: %v", err)
	}
}

func TestLoadAllowsDevSecretOutsideProduction(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("JWT_SECRET", "")
	cfg, err := Load("test")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.JWTSecret != DevJWTSecret {
		t.Errorf("JWTSecret = %q", cfg.JWTSecret)
	}
}

func TestCORSOriginsAreTrimmed(t *testing.T) {
	t.Setenv("CORS_ORIGINS", " https://a.example , ,https://b.example,")
	cfg, err := Load("test")
	if err != nil {
		t.Fatal(err)
	}
	if got := cfg.CORSOrigins; len(got) != 2 || got[0] != "https://a.example" || got[1] != "https://b.example" {
		t.Errorf("CORSOrigins = %q", got)
	}
}
