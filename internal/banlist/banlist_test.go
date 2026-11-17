package banlist

import (
	"os"
	"strings"
	"testing"
)

func TestDefaultListIsConsistent(t *testing.T) {
	l := Default()
	if l.Format != "OCG" || l.EffectiveFrom != "2003-10-15" || l.Name == "" || l.Source == "" {
		t.Fatalf("metadados inesperados: %+v", l)
	}
	// 52 limitadas + 9 semilimitadas, conforme a lista de outubro/2003; nenhuma proibida.
	var forbidden, limited, semi int
	for _, c := range l.Cards {
		switch c.MaxCopies {
		case 0:
			forbidden++
		case 1:
			limited++
		case 2:
			semi++
		}
	}
	if forbidden != 0 || limited != 52 || semi != 9 {
		t.Errorf("proibidas=%d limitadas=%d semilimitadas=%d, esperado 0/52/9", forbidden, limited, semi)
	}
}

func TestMaxCopiesLookups(t *testing.T) {
	l := Default()
	cases := map[int64]int{
		55144522: 1, // Pot of Greed: limitada
		46986414: 3, // Dark Magician: sem restrição
	}
	for id, want := range cases {
		if got := l.MaxCopies(id); got != want {
			t.Errorf("MaxCopies(%d) = %d, esperado %d", id, got, want)
		}
	}
	if !l.Restricted(55144522) || l.Restricted(46986414) {
		t.Error("Restricted deveria refletir a presença na lista")
	}
}

func TestEmbeddedListMatchesSourceFile(t *testing.T) {
	f, err := os.Open("../../data/banlist/ocg-2003-10.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	entries, err := ParseSource(f)
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]int{}
	for _, c := range Default().Cards {
		byName[strings.ToLower(c.Name)] = c.MaxCopies
	}
	if len(entries) != len(byName) {
		t.Fatalf("o arquivo-fonte tem %d cartas e o JSON %d; rode go run ./cmd/banlist", len(entries), len(byName))
	}
	for _, e := range entries {
		if got, ok := byName[strings.ToLower(e.Name)]; !ok || got != e.MaxCopies {
			t.Errorf("%q: JSON=%v(ok=%v), fonte=%d; rode go run ./cmd/banlist", e.Name, got, ok, e.MaxCopies)
		}
	}
}

func TestParseRejectsBadData(t *testing.T) {
	bad := map[string]string{
		"limite fora da faixa": `{"cards":[{"cardId":1,"name":"A","maxCopies":3}]}`,
		"carta repetida":       `{"cards":[{"cardId":1,"name":"A","maxCopies":1},{"cardId":1,"name":"A","maxCopies":2}]}`,
		"json quebrado":        `{`,
	}
	for name, data := range bad {
		if _, err := Parse([]byte(data)); err == nil {
			t.Errorf("%s: esperava erro", name)
		}
	}
}

func TestParseSource(t *testing.T) {
	src := "# comentário\n\nlimited\tPot of Greed\nsemi\tLast Turn\r\nforbidden\tMetamorphosis\n"
	got, err := ParseSource(strings.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	want := []Entry{{"Pot of Greed", 1}, {"Last Turn", 2}, {"Metamorphosis", 0}}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("entrada %d = %+v, esperado %+v", i, got[i], want[i])
		}
	}

	for name, bad := range map[string]string{
		"status desconhecido": "banned\tX\n",
		"sem tab":             "limited Pot of Greed\n",
		"nome vazio":          "limited\t\n",
		"duplicada":           "limited\tA\nsemi\ta\n",
	} {
		if _, err := ParseSource(strings.NewReader(bad)); err == nil {
			t.Errorf("%s: esperava erro", name)
		}
	}
}
