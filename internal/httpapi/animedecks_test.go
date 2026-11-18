package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golden-era/api/internal/animedecks"
	"github.com/golden-era/api/internal/auth"
	"github.com/golden-era/api/internal/store"
)

// Catálogo falso: 1 monstro, 2 magia, 3 armadilha, 5 fusão (Extra Deck). Lista de teste: 1 limitada (1 cópia), 3 proibida.
func newAnimeServer(t *testing.T) *httptest.Server {
	t.Helper()
	c, err := animedecks.Parse([]byte(`{"decks":[{"slug":"teste","character":"Personagem Teste","series":"Série","description":"Um deck.",
		"coverCardId":1,"missing":["Carta Futura"],"cards":[
		{"cardId":1,"name":"A","quantity":3},{"cardId":2,"name":"B","quantity":2},{"cardId":3,"name":"C","quantity":1},
		{"cardId":5,"name":"E","quantity":1},{"cardId":999,"name":"Fora","quantity":1}]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	users, cards := newFakeUsers(), &fakeCards{}
	decks := &fakeDecks{decks: map[string]*store.Deck{}, users: users, cards: cards}
	srv := httptest.NewServer(NewHandler(log, "test", Deps{
		Cards: cards, Users: users, Decks: decks,
		Social:       &fakeSocial{decks: decks, users: users, likes: map[[2]string]bool{}},
		Tokens:       auth.NewTokens("test-secret-test-secret-test-secret-12", time.Minute, time.Hour),
		ImageBaseURL: "http://img", Banlist: testBanlist(t), AnimeDecks: c,
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestListAnimeDecksIsPublic(t *testing.T) {
	srv := newAnimeServer(t)
	var list []struct {
		Slug, Character string
		CardCount       int
		Missing         []string
		CoverImageUrl   *string
	}
	call(t, "GET", srv.URL+"/v1/anime-decks", "", nil, http.StatusOK, &list)
	if len(list) != 1 || list[0].Slug != "teste" || list[0].CardCount != 7+1 || len(list[0].Missing) != 1 {
		t.Fatalf("lista inesperada: %+v", list)
	}
	if list[0].CoverImageUrl == nil || !strings.HasPrefix(*list[0].CoverImageUrl, "http://img/") {
		t.Errorf("capa = %v", list[0].CoverImageUrl)
	}
}

func TestImportAnimeDeck(t *testing.T) {
	srv := newAnimeServer(t)

	// Sem login: 401. Slug inexistente: 404.
	call(t, "POST", srv.URL+"/v1/anime-decks/teste/import", "", nil, http.StatusUnauthorized, nil)
	tok := register(t, srv, "yugi@example.com", "yugi").AccessToken
	call(t, "POST", srv.URL+"/v1/anime-decks/nao-existe/import", tok, nil, http.StatusNotFound, nil)

	var d struct {
		Name, Visibility, Description string
		Cards                         struct {
			Main, Extra []struct{ CardId, Quantity int }
		}
	}
	call(t, "POST", srv.URL+"/v1/anime-decks/teste/import", tok, nil, http.StatusCreated, &d)
	if d.Visibility != "private" || d.Name != "Deck de Personagem Teste" {
		t.Fatalf("deck: %+v", d)
	}
	// Carta 1 (limitada) cai de 3 para 1; 2 mantém 2; 3 (proibida) é omitida; 5 vai para o Extra; 999 não existe no catálogo.
	got := map[int]int{}
	for _, e := range d.Cards.Main {
		got[e.CardId] = e.Quantity
	}
	if got[1] != 1 || got[2] != 2 || len(got) != 2 {
		t.Errorf("principal = %+v", d.Cards.Main)
	}
	if len(d.Cards.Extra) != 1 || d.Cards.Extra[0].CardId != 5 {
		t.Errorf("extra = %+v", d.Cards.Extra)
	}
	for _, want := range []string{"Carta Futura", "Fora", "A (3→1)", "C (1→0)"} {
		if !strings.Contains(d.Description, want) {
			t.Errorf("a descrição devia citar %q: %s", want, d.Description)
		}
	}
	// O rascunho aparece em "meus decks".
	var mine struct{ Items []struct{ Name string } }
	call(t, "GET", srv.URL+"/v1/me/decks", tok, nil, http.StatusOK, &mine)
	if len(mine.Items) != 1 {
		t.Errorf("meus decks: %+v", mine)
	}
}
