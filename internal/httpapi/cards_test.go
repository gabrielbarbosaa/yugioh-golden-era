package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/deck"
	"github.com/golden-era/api/internal/store"
)

// fakeCards é um CardStore em memória: três cartas ordenadas por (nome, id).
type fakeCards struct {
	lastFilter store.CardFilter
	lastAfter  *store.CardCursor
	lastLimit  int
}

var fakeCatalog = []store.Card{
	{ID: 1, Name: "A", Type: "Normal Monster", ImagePath: "cards/1.jpg", ImageSmallPath: "cards_small/1.jpg"},
	{ID: 2, Name: "B", Type: "Spell Card", ImagePath: "cards/2.jpg", ImageSmallPath: "cards_small/2.jpg"},
	{ID: 3, Name: "C", Type: "Trap Card", ImagePath: "cards/3.jpg", ImageSmallPath: "cards_small/3.jpg"},
}

func (f *fakeCards) List(_ context.Context, flt store.CardFilter, after *store.CardCursor, limit int) ([]store.Card, bool, error) {
	f.lastFilter, f.lastAfter, f.lastLimit = flt, after, limit
	var rest []store.Card
	for _, c := range fakeCatalog {
		if after == nil || c.Name > after.Name {
			rest = append(rest, c)
		}
	}
	if len(rest) > limit {
		return rest[:limit], true, nil
	}
	return rest, false, nil
}

func (f *fakeCards) Get(_ context.Context, id int64) (store.Card, error) {
	for _, c := range fakeCatalog {
		if c.ID == id {
			return c, nil
		}
	}
	return store.Card{}, store.ErrNotFound
}

// Infos conhece as cartas 1 (monstro), 2 (magia), 3 (armadilha), 5 (fusão, Extra Deck)
// e as sintéticas 100–199 (monstros normais), úteis para montar decks de 40+ cartas.
func (f *fakeCards) Infos(_ context.Context, ids []int64) (map[int64]deck.CardInfo, error) {
	lvl := 4
	out := map[int64]deck.CardInfo{}
	for _, id := range ids {
		switch {
		case id == 1:
			out[id] = deck.CardInfo{Name: "Monstro", Type: "Normal Monster", Level: &lvl}
		case id == 2:
			out[id] = deck.CardInfo{Name: "Magia", Type: "Spell Card"}
		case id == 3:
			out[id] = deck.CardInfo{Name: "Armadilha", Type: "Trap Card"}
		case id == 5:
			out[id] = deck.CardInfo{Name: "Fusão", Type: "Fusion Monster", Level: &lvl, IsExtraDeck: true}
		case id >= 100 && id < 200:
			out[id] = deck.CardInfo{Name: "Sintética " + strconv.FormatInt(id, 10), Type: "Normal Monster", Level: &lvl}
		}
	}
	return out, nil
}

func (f *fakeCards) Archetypes(context.Context) ([]string, error) { return nil, nil }

func (f *fakeCards) Sets(context.Context, time.Time) ([]store.CardSet, error) {
	return []store.CardSet{{Code: "LOB", Name: "Legend of Blue Eyes", NumOfCards: 126}}, nil
}

func getJSON(t *testing.T, url string, want int, out any) {
	t.Helper()
	res, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != want {
		t.Fatalf("GET %s: status = %d, esperado %d", url, res.StatusCode, want)
	}
	if out != nil {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			t.Fatal(err)
		}
	}
}

func TestListCardsPaginatesWithCursor(t *testing.T) {
	srv := newTestServer(t)

	var p1 gen.CardPage
	getJSON(t, srv.URL+"/v1/cards?limit=2", http.StatusOK, &p1)
	if len(p1.Items) != 2 || p1.NextCursor == nil {
		t.Fatalf("página 1 inesperada: %d itens, cursor %v", len(p1.Items), p1.NextCursor)
	}
	if got := p1.Items[0].ImageUrl; got != "http://img/cards/1.jpg" {
		t.Errorf("imageUrl = %q", got)
	}

	var p2 gen.CardPage
	getJSON(t, srv.URL+"/v1/cards?limit=2&cursor="+*p1.NextCursor, http.StatusOK, &p2)
	if len(p2.Items) != 1 || p2.Items[0].Id != 3 || p2.NextCursor != nil {
		t.Fatalf("página 2 inesperada: %+v", p2)
	}
}

func TestListCardsRejectsBadInput(t *testing.T) {
	srv := newTestServer(t)
	for _, q := range []string{"limit=0", "limit=101", "level=13", "cursor=%25%25%25", "cursor=bm90LWpzb24"} {
		getJSON(t, srv.URL+"/v1/cards?"+q, http.StatusBadRequest, nil)
	}
}

func TestGetCard(t *testing.T) {
	srv := newTestServer(t)

	var c gen.Card
	getJSON(t, srv.URL+"/v1/cards/2", http.StatusOK, &c)
	if c.Name != "B" {
		t.Errorf("name = %q", c.Name)
	}

	var p gen.Problem
	getJSON(t, srv.URL+"/v1/cards/999", http.StatusNotFound, &p)
	if p.Status != http.StatusNotFound {
		t.Errorf("problem.status = %d", p.Status)
	}
}

func TestListArchetypesAndSetsReturnArrays(t *testing.T) {
	srv := newTestServer(t)

	var arch []string
	getJSON(t, srv.URL+"/v1/archetypes", http.StatusOK, &arch)
	if arch == nil {
		t.Error("archetypes deveria ser [] e não null")
	}

	var sets []gen.CardSet
	getJSON(t, srv.URL+"/v1/sets", http.StatusOK, &sets)
	if len(sets) != 1 || sets[0].Code != "LOB" {
		t.Errorf("sets inesperados: %+v", sets)
	}
}
