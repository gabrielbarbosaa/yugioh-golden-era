package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func corsServer(t *testing.T, origins ...string) *httptest.Server {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(NewHandler(log, "test", Deps{Cards: &fakeCards{}, CORSOrigins: origins}))
	t.Cleanup(srv.Close)
	return srv
}

func TestCORSPreflightAndSimpleRequest(t *testing.T) {
	srv := corsServer(t, "http://localhost:8081", "http://localhost:3000/")

	// Preflight de uma rota que só existe com GET: precisa ser respondido antes do roteador.
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/v1/cards", nil)
	req.Header.Set("Origin", "http://localhost:8081")
	req.Header.Set("Access-Control-Request-Method", "GET")
	req.Header.Set("Access-Control-Request-Headers", "authorization")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight: status = %d, esperado 204", res.StatusCode)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:8081" {
		t.Errorf("Allow-Origin = %q", got)
	}
	if res.Header.Get("Access-Control-Allow-Headers") == "" {
		t.Error("Allow-Headers ausente")
	}

	// Requisição real: devolve o cabeçalho e continua funcionando; barra final na config é ignorada.
	req, _ = http.NewRequest(http.MethodGet, srv.URL+"/v1/cards?limit=1", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK || res.Header.Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("status=%d allow-origin=%q", res.StatusCode, res.Header.Get("Access-Control-Allow-Origin"))
	}
}

func TestCORSIgnoresUnknownOriginsAndNonBrowserClients(t *testing.T) {
	srv := corsServer(t, "http://localhost:8081")

	for name, origin := range map[string]string{"origem desconhecida": "http://evil.example", "sem Origin (app nativo)": ""} {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/v1/cards?limit=1", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Errorf("%s: a API deve continuar respondendo, status=%d", name, res.StatusCode)
		}
		if res.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("%s: não deveria liberar CORS", name)
		}
	}
}

func TestCORSWildcard(t *testing.T) {
	srv := corsServer(t, "*")
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/v1/cards?limit=1", nil)
	req.Header.Set("Origin", "https://qualquer.example")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.Header.Get("Access-Control-Allow-Origin") != "https://qualquer.example" {
		t.Errorf("Allow-Origin = %q", res.Header.Get("Access-Control-Allow-Origin"))
	}
}
