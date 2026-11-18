package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(NewHandler(log, "test", Deps{Cards: &fakeCards{}, ImageBaseURL: "http://img"}))
	t.Cleanup(srv.Close)
	return srv
}

func TestHealth(t *testing.T) {
	srv := newTestServer(t)

	res, err := http.Get(srv.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, esperado 200", res.StatusCode)
	}
	if res.Header.Get("X-Request-Id") == "" {
		t.Error("X-Request-Id ausente")
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" || body["version"] != "test" {
		t.Errorf("corpo inesperado: %v", body)
	}
}

func TestSpecIsServed(t *testing.T) {
	srv := newTestServer(t)

	res, err := http.Get(srv.URL + "/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, esperado 200", res.StatusCode)
	}
	if !strings.Contains(string(b), "openapi: 3.0.3") {
		t.Error("spec OpenAPI nÃƒÆ’Ã‚Â£o encontrada na resposta")
	}
}

func TestDocsPage(t *testing.T) {
	srv := newTestServer(t)

	res, err := http.Get(srv.URL + "/docs")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, esperado 200", res.StatusCode)
	}
	if !strings.Contains(string(b), "SwaggerUIBundle") {
		t.Error("pÃƒÆ’Ã‚Â¡gina do Swagger UI nÃƒÆ’Ã‚Â£o encontrada")
	}
}

func TestRootRedirectsToDocs(t *testing.T) {
	srv := newTestServer(t)
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}

	res, err := client.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusFound || res.Header.Get("Location") != "/docs" {
		t.Fatalf("esperado redirect 302 para /docs, obtido %d -> %q",
			res.StatusCode, res.Header.Get("Location"))
	}
}

func TestUnknownRouteReturnsProblemJSON(t *testing.T) {
	srv := newTestServer(t)

	res, err := http.Get(srv.URL + "/nao-existe")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, esperado 404", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/problem+json" {
		t.Errorf("Content-Type = %q", ct)
	}
}

func TestImagesAreServedWithoutDirectoryListing(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "cards"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "cards", "1.jpg"), []byte("img"), 0o644); err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(NewHandler(log, "test", Deps{Cards: &fakeCards{}, ImagesDir: dir}))
	t.Cleanup(srv.Close)

	for path, want := range map[string]int{
		"/images/cards/1.jpg": http.StatusOK,
		"/images/cards/":      http.StatusNotFound,
		"/images/cards/2.jpg": http.StatusNotFound,
	} {
		res, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != want {
			t.Errorf("GET %s = %d, esperado %d", path, res.StatusCode, want)
		}
	}
}

// Todas as operaÃ§Ãµes do contrato jÃ¡ tÃªm handler, entÃ£o o 501 Ã© testado direto no middleware:
// ele protege operaÃ§Ãµes que surgirem no contrato antes de ganharem implementaÃ§Ã£o.
func TestNotImplementedMiddleware(t *testing.T) {
	called := false
	next := func(context.Context, http.ResponseWriter, *http.Request, any) (any, error) {
		called = true
		return nil, nil
	}

	if _, err := notImplemented(next, "GetCard")(context.Background(), nil, nil, nil); err != nil || !called {
		t.Fatalf("operaÃ§Ã£o implementada deveria seguir adiante (err=%v, called=%v)", err, called)
	}
	called = false
	if _, err := notImplemented(next, "OperacaoNova")(context.Background(), nil, nil, nil); !errors.Is(err, errNotImplemented) || called {
		t.Fatalf("operaÃ§Ã£o sem handler deveria dar errNotImplemented sem chamar o handler (err=%v, called=%v)", err, called)
	}
}

// Toda operaÃ§Ã£o do contrato precisa constar em implemented (senÃ£o responderia 501 sem querer).
func TestAllContractOperationsAreImplemented(t *testing.T) {
	for _, op := range []string{
		"GetHealth", "Register", "Login", "RefreshToken", "Logout", "ListCards", "GetCard", "ListArchetypes", "ListSets", "GetBanlist", "GetCardFacets",
		"ListDecks", "CreateDeck", "ImportDeck", "GetDeck", "UpdateDeck", "DeleteDeck", "CopyDeck", "ExportDeck",
		"LikeDeck", "UnlikeDeck", "ListDeckComments", "CreateDeckComment", "GetMe", "UpdateMe", "ListMyDecks",
		"GetMyCollection", "ReplaceMyCollection", "GetUser", "ListUserDecks", "FollowUser", "UnfollowUser",
		"ListAnimeDecks", "ImportAnimeDeck",
	} {
		if !implemented[op] {
			t.Errorf("%s nÃ£o estÃ¡ em implemented", op)
		}
	}
}

func TestRecovererTurnsPanicInto500(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}), requestID, recoverer(log))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, esperado 500", rec.Code)
	}
}
