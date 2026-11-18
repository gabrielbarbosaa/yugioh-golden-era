package animedecks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEmbeddedIsValidAndNotEmpty(t *testing.T) {
	c := Default()
	if len(c.Decks) == 0 {
		t.Fatal("nenhum deck embutido")
	}
	for _, d := range c.Decks {
		if d.CoverCardID == 0 {
			t.Errorf("%s: sem capa", d.Slug)
		}
		found := false
		for _, card := range d.Cards {
			found = found || card.CardID == d.CoverCardID
		}
		if !found {
			t.Errorf("%s: a capa %d não está entre as cartas", d.Slug, d.CoverCardID)
		}
	}
	if _, ok := c.Get("nao-existe"); ok {
		t.Error("slug inexistente não devia ser encontrado")
	}
}

// O JSON embutido precisa refletir os arquivos-fonte: toda carta do .txt está em `cards` (pelo nome) ou em `missing`.
func TestEmbeddedMatchesSources(t *testing.T) {
	files, _ := filepath.Glob("../../data/anime-decks/*.txt")
	if len(files) == 0 {
		t.Fatal("nenhum arquivo-fonte em data/anime-decks")
	}
	if len(files) != len(Default().Decks) {
		t.Errorf("%d arquivos-fonte, %d decks embutidos: rode `go run ./cmd/animedecks`", len(files), len(Default().Decks))
	}
	for _, f := range files {
		r, err := os.Open(f)
		if err != nil {
			t.Fatal(err)
		}
		src, err := ParseSource(r)
		r.Close()
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		d, ok := Default().Get(src.Slug)
		if !ok {
			t.Errorf("%s: deck %q ausente do JSON", f, src.Slug)
			continue
		}
		have := map[string]int{}
		for _, c := range d.Cards {
			have[strings.ToLower(c.Name)] = c.Quantity
		}
		miss := map[string]bool{}
		for _, m := range d.Missing {
			miss[strings.ToLower(m)] = true
		}
		for _, e := range src.Entries {
			k := strings.ToLower(e.Name)
			if q, ok := have[k]; ok && q != e.Quantity {
				t.Errorf("%s: %q tem %d no txt e %d no JSON", src.Slug, e.Name, e.Quantity, q)
			} else if !ok && !miss[k] {
				t.Errorf("%s: %q não está no JSON (rode `go run ./cmd/animedecks`)", src.Slug, e.Name)
			}
		}
	}
}

func TestParseSource(t *testing.T) {
	s, err := ParseSource(strings.NewReader("# c\nslug: x\npersonagem: X\nserie: S\n\n3 Blue-Eyes\n2x Kuriboh\n"))
	if err != nil || s.Slug != "x" || len(s.Entries) != 2 || s.Entries[1].Quantity != 2 || s.Entries[1].Name != "Kuriboh" {
		t.Fatalf("lido: %+v, %v", s, err)
	}
	for _, bad := range []string{
		"slug: x\npersonagem: X\n4 Carta\n",       // quantidade fora de 1..3
		"slug: x\npersonagem: X\n1 A\n1 a\n",      // repetida
		"slug: x\npersonagem: X\nfoo: bar\n1 A\n", // chave desconhecida
		"slug: x\n1 A\n",                          // sem personagem
	} {
		if _, err := ParseSource(strings.NewReader(bad)); err == nil {
			t.Errorf("devia recusar %q", bad)
		}
	}
}

func TestParseRejectsBadCollections(t *testing.T) {
	for _, bad := range []string{
		`{"decks":[{"slug":"Ruim Slug","character":"A","cards":[{"cardId":1,"name":"a","quantity":1}]}]}`,
		`{"decks":[{"slug":"a","character":"A","cards":[{"cardId":1,"name":"a","quantity":4}]}]}`,
		`{"decks":[{"slug":"a","character":"A","cards":[{"cardId":1,"name":"a","quantity":1},{"cardId":1,"name":"a","quantity":1}]}]}`,
		`{"decks":[{"slug":"a","character":"A","cards":[]}]}`,
	} {
		if _, err := Parse([]byte(bad)); err == nil {
			t.Errorf("devia recusar %s", bad)
		}
	}
}
