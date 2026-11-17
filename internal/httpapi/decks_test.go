package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/golden-era/api/internal/auth"
	"github.com/golden-era/api/internal/deck"
	"github.com/golden-era/api/internal/store"
)

// fakeDecks implementa DeckStore em memória, reproduzindo as regras de visibilidade e dono do store real.
type fakeDecks struct {
	mu    sync.Mutex
	decks map[string]*store.Deck
	users *fakeUsers
	cards *fakeCards
}

func (f *fakeDecks) owner(id string) store.DeckOwner {
	u := f.users.users[id]
	return store.DeckOwner{ID: id, Username: u.Username}
}

func (f *fakeDecks) Create(ctx context.Context, ownerID string, in store.DeckInput) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := uuid.NewString()
	now := time.Now()
	f.decks[id] = &store.Deck{
		DeckSummary: store.DeckSummary{ID: id, Name: in.Name, Archetype: in.Archetype, Visibility: in.Visibility,
			CoverCardID: in.CoverCardID, CreatedAt: now, UpdatedAt: now, Owner: f.owner(ownerID)},
		Description: in.Description, Cards: in.Cards,
	}
	return id, nil
}

func (f *fakeDecks) Replace(_ context.Context, id, ownerID string, in store.DeckInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.decks[id]
	switch {
	case !ok:
		return store.ErrNotFound
	case d.Owner.ID != ownerID:
		return store.ErrForbidden
	}
	d.Name, d.Description, d.Archetype, d.Visibility, d.Cards = in.Name, in.Description, in.Archetype, in.Visibility, in.Cards
	d.CoverCardID, d.UpdatedAt = in.CoverCardID, time.Now()
	return nil
}

func (f *fakeDecks) Delete(_ context.Context, id, ownerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.decks[id]
	switch {
	case !ok:
		return store.ErrNotFound
	case d.Owner.ID != ownerID:
		return store.ErrForbidden
	}
	delete(f.decks, id)
	return nil
}

func (f *fakeDecks) Get(ctx context.Context, id, viewerID string) (store.Deck, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.decks[id]
	if !ok || (d.Visibility != "public" && d.Owner.ID != viewerID) {
		return store.Deck{}, store.ErrNotFound
	}
	out := *d
	out.Infos, _ = f.cards.Infos(ctx, d.Cards.IDs())
	return out, nil
}

func (f *fakeDecks) List(_ context.Context, fl store.DeckFilter, _ *store.DeckCursor, limit int) ([]store.DeckSummary, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []store.DeckSummary
	for _, d := range f.decks {
		if fl.PublicOnly && d.Visibility != "public" {
			continue
		}
		if fl.OwnerID != nil && d.Owner.ID != *fl.OwnerID {
			continue
		}
		if fl.OwnerUsername != nil && d.Owner.Username != *fl.OwnerUsername {
			continue
		}
		out = append(out, d.DeckSummary)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	if len(out) > limit {
		return out[:limit], true, nil
	}
	return out, false, nil
}

func (f *fakeDecks) Copy(ctx context.Context, srcID, userID string) (string, error) {
	src, err := f.Get(ctx, srcID, userID)
	if err != nil {
		return "", err
	}
	return f.Create(ctx, userID, store.DeckInput{Name: "Cópia de " + src.Name, Description: src.Description,
		Archetype: src.Archetype, Visibility: "private", CoverCardID: src.CoverCardID, Cards: src.Cards})
}

func (f *fakeDecks) UserExists(_ context.Context, username string) (bool, error) {
	for _, u := range f.users.users {
		if u.Username == username {
			return true, nil
		}
	}
	return false, nil
}

func newDeckServer(t *testing.T) *httptest.Server {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	users, cards := newFakeUsers(), &fakeCards{}
	srv := httptest.NewServer(NewHandler(log, "test", Deps{
		Cards:  cards,
		Users:  users,
		Decks:  &fakeDecks{decks: map[string]*store.Deck{}, users: users, cards: cards},
		Tokens: auth.NewTokens("test-secret-test-secret-test-secret-12", time.Minute, time.Hour),
	}))
	t.Cleanup(srv.Close)
	return srv
}

// Catálogo do teste: 1 monstro, 2 magia, 3 armadilha (ver fakeCatalog) e 5 monstro de fusão.
func draft(name, visibility string) map[string]any {
	return map[string]any{
		"name": name, "visibility": visibility,
		"cards": map[string]any{
			"main":  []map[string]any{{"cardId": 1, "quantity": 3}, {"cardId": 2, "quantity": 2}, {"cardId": 3, "quantity": 1}},
			"extra": []map[string]any{{"cardId": 5, "quantity": 1}},
			"side":  []map[string]any{},
		},
	}
}

type deckResp struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Visibility string `json:"visibility"`
	Owner      struct{ Username string }
	Stats      struct {
		Monsters, Spells, Traps int
		AverageLevel            float64
	}
	Cards struct {
		Main, Extra, Side []struct{ CardId, Quantity int }
	}
}

func TestCreateDeckAndStats(t *testing.T) {
	srv := newDeckServer(t)
	tok := register(t, srv, "yugi@example.com", "yugi").AccessToken

	var d deckResp
	call(t, "POST", srv.URL+"/v1/decks", tok, draft("Meu deck", "private"), http.StatusCreated, &d)
	if d.Name != "Meu deck" || d.Owner.Username != "yugi" || d.Visibility != "private" {
		t.Fatalf("deck inesperado: %+v", d)
	}
	// main: 3 monstros + 2 magias + 1 armadilha; extra: 1 fusão => 4 monstros no total.
	if d.Stats.Monsters != 4 || d.Stats.Spells != 2 || d.Stats.Traps != 1 {
		t.Errorf("stats = %+v", d.Stats)
	}
	if len(d.Cards.Main) != 3 || len(d.Cards.Extra) != 1 {
		t.Errorf("cartas = %+v", d.Cards)
	}
	call(t, "POST", srv.URL+"/v1/decks", "", draft("x", "private"), http.StatusUnauthorized, nil)
}

func TestDeckRulesReturn422(t *testing.T) {
	srv := newDeckServer(t)
	tok := register(t, srv, "yugi@example.com", "yugi").AccessToken

	// Público com poucas cartas.
	var p struct {
		Errors []struct{ Field, Message string }
	}
	call(t, "POST", srv.URL+"/v1/decks", tok, draft("curto", "public"), http.StatusUnprocessableEntity, &p)
	if len(p.Errors) == 0 || p.Errors[0].Field != "cards.main" {
		t.Errorf("erros = %+v", p.Errors)
	}

	bad := draft("ruim", "private")
	bad["cards"].(map[string]any)["main"] = []map[string]any{{"cardId": 999, "quantity": 1}, {"cardId": 5, "quantity": 1}}
	call(t, "POST", srv.URL+"/v1/decks", tok, bad, http.StatusUnprocessableEntity, &p)
	if len(p.Errors) != 2 {
		t.Errorf("esperava carta inexistente + Extra no main, veio %+v", p.Errors)
	}

	call(t, "POST", srv.URL+"/v1/decks", tok, draft("   ", "private"), http.StatusUnprocessableEntity, nil)
}

// publicDraft monta um deck legal para publicação: 14 cartas sintéticas x 3 cópias = 42 no main.
func publicDraft(name string) map[string]any {
	var main []map[string]any
	for id := 100; id < 114; id++ {
		main = append(main, map[string]any{"cardId": id, "quantity": 3})
	}
	return map[string]any{
		"name": name, "visibility": "public",
		"cards": map[string]any{"main": main, "extra": []map[string]any{}, "side": []map[string]any{}},
	}
}

func TestPrivateDeckVisibilityAndOwnership(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	kaiba := register(t, srv, "kaiba@example.com", "kaiba").AccessToken

	var priv deckResp
	call(t, "POST", srv.URL+"/v1/decks", yugi, draft("privado", "private"), http.StatusCreated, &priv)

	// Visitante e outro usuário não enxergam o privado: 404, sem revelar que ele existe.
	call(t, "GET", srv.URL+"/v1/decks/"+priv.ID, "", nil, http.StatusNotFound, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+priv.ID, kaiba, nil, http.StatusNotFound, nil)
	call(t, "PUT", srv.URL+"/v1/decks/"+priv.ID, kaiba, draft("invasão", "private"), http.StatusNotFound, nil)
	call(t, "DELETE", srv.URL+"/v1/decks/"+priv.ID, kaiba, nil, http.StatusNotFound, nil)
	call(t, "POST", srv.URL+"/v1/decks/"+priv.ID+"/copy", kaiba, nil, http.StatusNotFound, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+priv.ID+"/export", "", nil, http.StatusNotFound, nil)

	// O dono enxerga e edita.
	call(t, "GET", srv.URL+"/v1/decks/"+priv.ID, yugi, nil, http.StatusOK, nil)
	var upd deckResp
	call(t, "PUT", srv.URL+"/v1/decks/"+priv.ID, yugi, draft("renomeado", "private"), http.StatusOK, &upd)
	if upd.Name != "renomeado" {
		t.Errorf("name = %q", upd.Name)
	}

	// Token inválido em rota de auth opcional é 401, não vira anônimo.
	call(t, "GET", srv.URL+"/v1/decks/"+priv.ID, "lixo", nil, http.StatusUnauthorized, nil)
}

func TestPublicDeckFlow(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	kaiba := register(t, srv, "kaiba@example.com", "kaiba").AccessToken

	var pub deckResp
	call(t, "POST", srv.URL+"/v1/decks", yugi, publicDraft("Meta"), http.StatusCreated, &pub)

	// Qualquer um vê, exporta e lista o deck público.
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID, "", nil, http.StatusOK, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID+"/export", "", nil, http.StatusOK, nil)
	var page struct{ Items []deckResp }
	call(t, "GET", srv.URL+"/v1/decks", "", nil, http.StatusOK, &page)
	if len(page.Items) != 1 || page.Items[0].ID != pub.ID {
		t.Fatalf("marketplace = %+v", page.Items)
	}
	call(t, "GET", srv.URL+"/v1/users/yugi/decks", "", nil, http.StatusOK, &page)
	if len(page.Items) != 1 {
		t.Errorf("decks do usuário = %+v", page.Items)
	}

	// Quem não é dono: 403 ao editar/remover (o deck é público, então sua existência não é segredo).
	call(t, "PUT", srv.URL+"/v1/decks/"+pub.ID, kaiba, publicDraft("roubo"), http.StatusForbidden, nil)
	call(t, "DELETE", srv.URL+"/v1/decks/"+pub.ID, kaiba, nil, http.StatusForbidden, nil)

	// Copiar gera um deck privado do usuário que copiou.
	var cp deckResp
	call(t, "POST", srv.URL+"/v1/decks/"+pub.ID+"/copy", kaiba, nil, http.StatusCreated, &cp)
	if cp.Name != "Cópia de Meta" || cp.Visibility != "private" || cp.Owner.Username != "kaiba" || cp.ID == pub.ID {
		t.Errorf("cópia inesperada: %+v", cp)
	}
	call(t, "GET", srv.URL+"/v1/decks/"+cp.ID, "", nil, http.StatusNotFound, nil)

	// Despublicar tira do marketplace; publicar de novo com poucas cartas é barrado e não altera nada.
	small := draft("Meta", "public")
	call(t, "PUT", srv.URL+"/v1/decks/"+pub.ID, yugi, small, http.StatusUnprocessableEntity, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID, "", nil, http.StatusOK, nil)

	// Dono remove.
	call(t, "DELETE", srv.URL+"/v1/decks/"+pub.ID, yugi, nil, http.StatusNoContent, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID, "", nil, http.StatusNotFound, nil)
}

func TestListsRespectVisibility(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	call(t, "POST", srv.URL+"/v1/decks", yugi, draft("privado", "private"), http.StatusCreated, nil)

	var page struct{ Items []deckResp }
	call(t, "GET", srv.URL+"/v1/decks", "", nil, http.StatusOK, &page)
	if len(page.Items) != 0 {
		t.Errorf("marketplace não deve listar privados: %+v", page.Items)
	}
	call(t, "GET", srv.URL+"/v1/me/decks", yugi, nil, http.StatusOK, &page)
	if len(page.Items) != 1 {
		t.Errorf("/me/decks deve incluir privados: %+v", page.Items)
	}
	call(t, "GET", srv.URL+"/v1/users/yugi/decks", "", nil, http.StatusOK, &page)
	if len(page.Items) != 0 {
		t.Errorf("decks de usuário são só os públicos: %+v", page.Items)
	}
	call(t, "GET", srv.URL+"/v1/users/ninguem/decks", "", nil, http.StatusNotFound, nil)
	call(t, "GET", srv.URL+"/v1/me/decks", "", nil, http.StatusUnauthorized, nil)
	call(t, "GET", srv.URL+"/v1/decks?sort=zzz", "", nil, http.StatusBadRequest, nil)
	call(t, "GET", srv.URL+"/v1/decks?limit=0", "", nil, http.StatusBadRequest, nil)
}

func TestYDKImportExport(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken

	post := func(body string, want int, out any) {
		req, _ := http.NewRequest("POST", srv.URL+"/v1/decks/import", strings.NewReader(body))
		req.Header.Set("Content-Type", "text/plain")
		req.Header.Set("Authorization", "Bearer "+yugi)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("import: status = %d, esperado %d (%s)", res.StatusCode, want, b)
		}
		if out != nil {
			*(out.(*string)) = string(b)
		}
	}

	var body string
	post("#created by alguem\n#main\n1\n1\n2\n#extra\n5\n!side\n3\n", http.StatusCreated, &body)
	if !strings.Contains(body, `"Deck importado"`) {
		t.Errorf("resposta inesperada: %s", body)
	}
	post("#main\n999\n", http.StatusUnprocessableEntity, nil)
	post("#main\nabc\n", http.StatusUnprocessableEntity, nil)

	// Exporta o deck recém-importado.
	var d deckResp
	call(t, "POST", srv.URL+"/v1/decks", yugi, draft("para exportar", "private"), http.StatusCreated, &d)
	req, _ := http.NewRequest("GET", srv.URL+"/v1/decks/"+d.ID+"/export", nil)
	req.Header.Set("Authorization", "Bearer "+yugi)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/plain") {
		t.Fatalf("export: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	parsed, issues := deck.ParseYDK(string(out))
	if len(issues) != 0 || len(parsed.Main) != 3 || len(parsed.Extra) != 1 {
		t.Errorf("YDK exportado não confere: %q (%+v)", out, issues)
	}
}
