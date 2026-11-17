package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/golden-era/api/internal/auth"
	"github.com/golden-era/api/internal/store"
)

// fakeCollection implementa CollectionStore em memória, descartando quantidades 0 como o store real.
type fakeCollection struct {
	mu    sync.Mutex
	items map[string]map[int64]int
}

func (f *fakeCollection) Get(_ context.Context, userID string) ([]store.CollectionItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []store.CollectionItem
	for id, q := range f.items[userID] {
		out = append(out, store.CollectionItem{CardID: id, Quantity: q})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CardID < out[j].CardID })
	return out, nil
}

func (f *fakeCollection) Replace(_ context.Context, userID string, items []store.CollectionItem) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	m := map[int64]int{}
	for _, it := range items {
		if it.Quantity > 0 {
			m[it.CardID] = it.Quantity
		}
	}
	f.items[userID] = m
	return nil
}

func newCollectionServer(t *testing.T) *httptest.Server {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(NewHandler(log, "test", Deps{
		Cards:      &fakeCards{},
		Users:      newFakeUsers(),
		Collection: &fakeCollection{items: map[string]map[int64]int{}},
		Tokens:     auth.NewTokens("test-secret-test-secret-test-secret-12", time.Minute, time.Hour),
	}))
	t.Cleanup(srv.Close)
	return srv
}

type collItem struct{ CardId, Quantity int }

func TestCollectionReplaceAndGet(t *testing.T) {
	srv := newCollectionServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	kaiba := register(t, srv, "kaiba@example.com", "kaiba").AccessToken

	var got []collItem
	call(t, "GET", srv.URL+"/v1/me/collection", yugi, nil, http.StatusOK, &got)
	if got == nil || len(got) != 0 {
		t.Fatalf("coleção nova deveria ser [] e não null: %#v", got)
	}

	// Itens fora de ordem, com um 0 que não deve ser gravado.
	put := []map[string]int{{"cardId": 3, "quantity": 2}, {"cardId": 1, "quantity": 3}, {"cardId": 2, "quantity": 0}}
	call(t, "PUT", srv.URL+"/v1/me/collection", yugi, put, http.StatusOK, &got)
	if len(got) != 2 || got[0] != (collItem{1, 3}) || got[1] != (collItem{3, 2}) {
		t.Fatalf("PUT devolveu %+v", got)
	}

	// Substituição, não mesclagem.
	call(t, "PUT", srv.URL+"/v1/me/collection", yugi, []map[string]int{{"cardId": 5, "quantity": 1}}, http.StatusOK, &got)
	if len(got) != 1 || got[0].CardId != 5 {
		t.Fatalf("depois de substituir: %+v", got)
	}

	// Cada usuário vê só a própria coleção.
	call(t, "GET", srv.URL+"/v1/me/collection", kaiba, nil, http.StatusOK, &got)
	if len(got) != 0 {
		t.Errorf("kaiba não deveria ver a coleção do yugi: %+v", got)
	}

	// Limpar a coleção.
	call(t, "PUT", srv.URL+"/v1/me/collection", yugi, []map[string]int{}, http.StatusOK, &got)
	if len(got) != 0 {
		t.Errorf("coleção deveria estar vazia: %+v", got)
	}
}

func TestCollectionValidation(t *testing.T) {
	srv := newCollectionServer(t)
	tok := register(t, srv, "yugi@example.com", "yugi").AccessToken

	tests := map[string][]map[string]int{
		"quantidade negativa":     {{"cardId": 1, "quantity": -1}},
		"quantidade acima do máx": {{"cardId": 1, "quantity": 1000}},
		"carta repetida":          {{"cardId": 1, "quantity": 1}, {"cardId": 1, "quantity": 2}},
		"carta inexistente":       {{"cardId": 999999, "quantity": 1}},
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			call(t, "PUT", srv.URL+"/v1/me/collection", tok, body, http.StatusUnprocessableEntity, nil)
		})
	}

	// Falha de validação não pode apagar a coleção existente.
	call(t, "PUT", srv.URL+"/v1/me/collection", tok, []map[string]int{{"cardId": 1, "quantity": 2}}, http.StatusOK, nil)
	call(t, "PUT", srv.URL+"/v1/me/collection", tok, []map[string]int{{"cardId": 999999, "quantity": 1}}, http.StatusUnprocessableEntity, nil)
	var got []collItem
	call(t, "GET", srv.URL+"/v1/me/collection", tok, nil, http.StatusOK, &got)
	if len(got) != 1 {
		t.Errorf("coleção foi alterada por um PUT inválido: %+v", got)
	}

	call(t, "GET", srv.URL+"/v1/me/collection", "", nil, http.StatusUnauthorized, nil)
	call(t, "PUT", srv.URL+"/v1/me/collection", "", []map[string]int{}, http.StatusUnauthorized, nil)
}
