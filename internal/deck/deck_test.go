package deck

import (
	"strings"
	"testing"
)

func intp(n int) *int { return &n }

var catalog = map[int64]CardInfo{
	1: {Name: "Dark Magician", Type: "Normal Monster", Level: intp(7)},
	2: {Name: "Mystical Elf", Type: "Normal Monster", Level: intp(4)},
	3: {Name: "Pot of Greed", Type: "Spell Card"},
	4: {Name: "Mirror Force", Type: "Trap Card"},
	5: {Name: "Thousand-Eyes Fusion", Type: "Fusion Monster", Level: intp(1), IsExtraDeck: true},
}

func fill(id int64, n int) []Entry {
	var out []Entry
	for ; n > 0; n -= 3 {
		q := 3
		if n < 3 {
			q = n
		}
		out = append(out, Entry{id, q})
	}
	return out
}

func has(issues []Issue, field, substr string) bool {
	for _, i := range issues {
		if i.Field == field && strings.Contains(i.Message, substr) {
			return true
		}
	}
	return false
}

func TestValidateAcceptsLegalDeck(t *testing.T) {
	c := Cards{
		Main:  []Entry{{1, 3}, {2, 3}, {3, 3}, {4, 3}},
		Extra: []Entry{{5, 1}},
	}
	// 12 cartas: ok como rascunho privado, mas não como público.
	if is := Validate(c, catalog, false); len(is) != 0 {
		t.Fatalf("rascunho privado deveria passar: %+v", is)
	}
	if is := Validate(c, catalog, true); !has(is, "cards.main", "entre 40 e 60") {
		t.Fatalf("deck público com 12 cartas deveria falhar: %+v", is)
	}
}

func TestValidateRules(t *testing.T) {
	tests := []struct {
		name  string
		cards Cards
		field string
		msg   string
	}{
		{"carta desconhecida", Cards{Main: []Entry{{99, 1}}}, "cards.main[0]", "não existe"},
		{"quantidade zero", Cards{Main: []Entry{{1, 0}}}, "cards.main[0].quantity", "entre 1 e 3"},
		{"quatro cópias", Cards{Main: []Entry{{1, 4}}}, "cards.main[0].quantity", "entre 1 e 3"},
		{"cópias somadas entre zonas", Cards{Main: []Entry{{1, 2}}, Side: []Entry{{1, 2}}}, "cards", "excede o limite"},
		{"entrada duplicada na zona", Cards{Main: []Entry{{1, 1}, {1, 1}}}, "cards.main[1]", "mais de uma vez"},
		{"extra no main", Cards{Main: []Entry{{5, 1}}}, "cards.main[0]", "Extra Deck"},
		{"normal no extra", Cards{Extra: []Entry{{1, 1}}}, "cards.extra[0]", "não é do Extra Deck"},
		{"main acima de 60", Cards{Main: append(append(fill(1, 3), fill(2, 3)...), manyDistinct(60)...)}, "cards.main", "no máximo 60"},
		{"extra acima de 15", Cards{Extra: []Entry{{5, 3}, {5, 3}, {5, 3}, {5, 3}, {5, 3}, {5, 3}}}, "cards.extra", "no máximo 15"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			is := Validate(tt.cards, catalog, false)
			if !has(is, tt.field, tt.msg) {
				t.Errorf("esperava erro %s ~ %q, vieram %+v", tt.field, tt.msg, is)
			}
		})
	}
}

// manyDistinct devolve n cartas "diferentes" de 1 cópia usando ids que existem no catálogo de teste.
func manyDistinct(n int) []Entry {
	out := make([]Entry, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, Entry{int64(3 + i%2), 1}) // repetidos: só a soma importa para o teste de tamanho
	}
	return out
}

func TestComputeStats(t *testing.T) {
	c := Cards{
		Main:  []Entry{{1, 2}, {2, 1}, {3, 3}, {4, 1}},
		Extra: []Entry{{5, 1}},
	}
	s := ComputeStats(c, catalog)
	if s.Monsters != 4 || s.Spells != 3 || s.Traps != 1 {
		t.Errorf("contagens erradas: %+v", s)
	}
	// (7*2 + 4*1 + 1*1) / 4 = 4.75
	if s.AverageLevel == nil || *s.AverageLevel != 4.75 {
		t.Errorf("nível médio = %v, esperado 4.75", s.AverageLevel)
	}
	if empty := ComputeStats(Cards{Main: []Entry{{3, 1}}}, catalog); empty.AverageLevel != nil {
		t.Error("sem monstros, o nível médio deveria ser nil")
	}
}

func TestYDKRoundTrip(t *testing.T) {
	src := "#created by yugi\n#main\n1\n1\n2\n3\n#extra\n5\n!side\n4\n4\n"
	c, issues := ParseYDK(src)
	if len(issues) != 0 {
		t.Fatalf("issues: %+v", issues)
	}
	if len(c.Main) != 3 || c.Main[0] != (Entry{1, 2}) || c.Extra[0] != (Entry{5, 1}) || c.Side[0] != (Entry{4, 2}) {
		t.Fatalf("parse inesperado: %+v", c)
	}
	out := FormatYDK(c, "yugi")
	again, _ := ParseYDK(out)
	if FormatYDK(again, "yugi") != out {
		t.Errorf("round trip diferente:\n%s", out)
	}
}

func TestParseYDKReportsBadLines(t *testing.T) {
	_, issues := ParseYDK("1\n#main\nabc\n-5\n")
	if len(issues) != 3 { // carta fora de seção + 2 inválidas
		t.Errorf("esperava 3 problemas, vieram %+v", issues)
	}
	if _, issues := ParseYDK("\xef\xbb\xbf#main\r\n1\r\n"); len(issues) != 0 {
		t.Errorf("BOM e CRLF deveriam ser aceitos: %+v", issues)
	}
}

func TestCover(t *testing.T) {
	if got := Cover(Cards{Main: []Entry{{7, 1}}, Extra: []Entry{{8, 1}}}); got == nil || *got != 7 {
		t.Errorf("capa = %v", got)
	}
	if got := Cover(Cards{}); got != nil {
		t.Errorf("deck vazio não tem capa: %v", got)
	}
}

func TestValidateBanlistLimits(t *testing.T) {
	cat := map[int64]CardInfo{
		1: {Name: "Pot of Greed", Type: "Spell Card", Limit: intp(1)},
		2: {Name: "Morphing Jar", Type: "Effect Monster", Limit: intp(2)},
		3: {Name: "Metamorphosis", Type: "Spell Card", Limit: intp(0)},
		4: {Name: "Dark Magician", Type: "Normal Monster"},
	}
	tests := []struct {
		name  string
		cards Cards
		msg   string // vazio = deve passar
	}{
		{"limitada com 1 cópia", Cards{Main: []Entry{{1, 1}}}, ""},
		{"limitada com 2 cópias", Cards{Main: []Entry{{1, 2}}}, "limitada"},
		{"limitada somando zonas", Cards{Main: []Entry{{1, 1}}, Side: []Entry{{1, 1}}}, "no máximo 1 cópia"},
		{"semilimitada com 2 cópias", Cards{Main: []Entry{{2, 2}}}, ""},
		{"semilimitada com 3 cópias", Cards{Main: []Entry{{2, 3}}}, "semilimitada"},
		{"proibida", Cards{Main: []Entry{{3, 1}}}, "proibida"},
		{"sem restrição segue em 3", Cards{Main: []Entry{{4, 3}}}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			is := Validate(tt.cards, cat, false)
			if tt.msg == "" {
				if len(is) != 0 {
					t.Fatalf("deveria passar: %+v", is)
				}
				return
			}
			if !has(is, "cards", tt.msg) {
				t.Fatalf("esperava aviso com %q em cards, veio %+v", tt.msg, is)
			}
		})
	}
}
