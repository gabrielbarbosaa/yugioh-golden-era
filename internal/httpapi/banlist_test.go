package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"github.com/golden-era/api/internal/banlist"
)

// Lista do teste sobre o catálogo falso: carta 1 limitada, 2 semilimitada, 3 proibida; as demais livres.
func testBanlist(t *testing.T) *banlist.List {
	t.Helper()
	l, err := banlist.Parse([]byte(`{"name":"Lista de teste","format":"OCG","effectiveFrom":"2003-10-15","source":"teste","cards":[
		{"cardId":1,"name":"A","maxCopies":1},
		{"cardId":2,"name":"B","maxCopies":2},
		{"cardId":3,"name":"C","maxCopies":0}]}`))
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestGetBanlistIsPublic(t *testing.T) {
	srv := newDeckServerWithBanlist(t, testBanlist(t))
	var b struct {
		Name          string
		Format        string
		EffectiveFrom string
		Cards         []struct {
			CardID    int64 `json:"cardId"`
			Name      string
			MaxCopies int `json:"maxCopies"`
		}
	}
	call(t, "GET", srv.URL+"/v1/banlist", "", nil, http.StatusOK, &b)
	if b.Name != "Lista de teste" || b.Format != "OCG" || b.EffectiveFrom != "2003-10-15" || len(b.Cards) != 3 {
		t.Fatalf("banlist inesperada: %+v", b)
	}
	if b.Cards[0].CardID != 1 || b.Cards[0].MaxCopies != 1 || b.Cards[2].MaxCopies != 0 {
		t.Errorf("cartas inesperadas: %+v", b.Cards)
	}
}

func TestCardsExposeMaxCopies(t *testing.T) {
	srv := newDeckServerWithBanlist(t, testBanlist(t))
	var page struct {
		Items []struct {
			ID        int64 `json:"id"`
			MaxCopies int   `json:"maxCopies"`
		}
	}
	call(t, "GET", srv.URL+"/v1/cards?limit=10", "", nil, http.StatusOK, &page)
	want := map[int64]int{1: 1, 2: 2, 3: 0}
	if len(page.Items) != 3 {
		t.Fatalf("itens = %+v", page.Items)
	}
	for _, c := range page.Items {
		if c.MaxCopies != want[c.ID] {
			t.Errorf("carta %d: maxCopies = %d, esperado %d", c.ID, c.MaxCopies, want[c.ID])
		}
	}
	// Sem lista própria vale a embutida: as cartas do catálogo falso não estão nela, então o limite é 3.
	def := newDeckServer(t)
	call(t, "GET", def.URL+"/v1/cards?limit=10", "", nil, http.StatusOK, &page)
	for _, c := range page.Items {
		if c.MaxCopies != 3 {
			t.Errorf("carta %d com lista embutida: maxCopies = %d, esperado 3", c.ID, c.MaxCopies)
		}
	}
}

func deckWith(visibility string, main ...map[string]any) map[string]any {
	return map[string]any{
		"name": "Meu deck", "visibility": visibility,
		"cards": map[string]any{"main": main, "extra": []map[string]any{}, "side": []map[string]any{}},
	}
}

func TestDeckRulesApplyBanlist(t *testing.T) {
	srv := newDeckServerWithBanlist(t, testBanlist(t))
	tok := register(t, srv, "yugi@example.com", "yugi").AccessToken
	card := func(id, qty int) map[string]any { return map[string]any{"cardId": id, "quantity": qty} }

	// Dentro dos limites: 1 cópia da limitada, 2 da semilimitada e 3 de uma carta livre (5 é do Extra, então 100).
	call(t, "POST", srv.URL+"/v1/decks", tok, deckWith("private", card(1, 1), card(2, 2), card(100, 3)), http.StatusCreated, nil)

	cases := []struct {
		name string
		body map[string]any
		msg  string
	}{
		{"limitada com 2 cópias", deckWith("private", card(1, 2)), "limitada"},
		{"semilimitada com 3 cópias", deckWith("private", card(2, 3)), "semilimitada"},
		{"proibida", deckWith("private", card(3, 1)), "proibida"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var p struct {
				Errors []struct{ Field, Message string }
			}
			call(t, "POST", srv.URL+"/v1/decks", tok, tc.body, http.StatusUnprocessableEntity, &p)
			found := false
			for _, e := range p.Errors {
				found = found || strings.Contains(e.Message, tc.msg)
			}
			if !found {
				t.Errorf("esperava erro com %q, veio %+v", tc.msg, p.Errors)
			}
		})
	}
}
