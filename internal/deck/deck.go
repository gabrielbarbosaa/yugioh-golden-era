// Package deck reúne as regras de montagem de decks, as estatísticas e o formato YDK.
// É código puro: não conhece HTTP nem banco.
package deck

import (
	"fmt"
	"sort"
	"strings"
)

// Limites de montagem.
const (
	MinMain    = 40
	MaxMain    = 60
	MaxExtra   = 15
	MaxSide    = 15
	MaxCopies  = 3
	MaxNameLen = 80
	MaxDescLen = 2000
	MaxArchLen = 100
)

// Entry é uma carta e a quantidade de cópias em uma zona.
type Entry struct {
	CardID   int64
	Quantity int
}

// Cards são as três zonas de um deck.
type Cards struct {
	Main  []Entry
	Extra []Entry
	Side  []Entry
}

// IDs devolve os ids distintos de todas as zonas.
func (c Cards) IDs() []int64 {
	seen := map[int64]bool{}
	var out []int64
	for _, zone := range [][]Entry{c.Main, c.Extra, c.Side} {
		for _, e := range zone {
			if !seen[e.CardID] {
				seen[e.CardID] = true
				out = append(out, e.CardID)
			}
		}
	}
	return out
}

// CardInfo é o que as regras precisam saber de cada carta do catálogo.
type CardInfo struct {
	Name        string
	Type        string
	Level       *int
	IsExtraDeck bool
	// Limit é o máximo de cópias imposto pela lista de proibidas/limitadas (0 = proibida, 1 = limitada,
	// 2 = semilimitada). Nulo significa sem restrição, ou seja, o máximo geral (MaxCopies).
	Limit *int
}

// Issue descreve um problema de validação em um campo.
type Issue struct {
	Field   string
	Message string
}

func limitName(limit int) string {
	if limit == 1 {
		return "limitada"
	}
	return "semilimitada"
}

func copyWord(n int) string {
	if n == 1 {
		return "cópia"
	}
	return "cópias"
}

func total(es []Entry) int {
	n := 0
	for _, e := range es {
		n += e.Quantity
	}
	return n
}

// Validate confere as regras de montagem. Os limites máximos valem sempre; o mínimo de
// 40 cartas no deck principal só é exigido de decks públicos, para permitir rascunhos privados.
func Validate(c Cards, info map[int64]CardInfo, public bool) []Issue {
	var issues []Issue

	zones := []struct {
		name    string
		entries []Entry
		max     int
	}{
		{"main", c.Main, MaxMain},
		{"extra", c.Extra, MaxExtra},
		{"side", c.Side, MaxSide},
	}

	copies := map[int64]int{}
	for _, z := range zones {
		seen := map[int64]bool{}
		for i, e := range z.entries {
			field := fmt.Sprintf("cards.%s[%d]", z.name, i)
			ci, known := info[e.CardID]
			switch {
			case !known:
				issues = append(issues, Issue{field, fmt.Sprintf("a carta %d não existe no catálogo da era", e.CardID)})
				continue
			case e.Quantity < 1 || e.Quantity > MaxCopies:
				issues = append(issues, Issue{field + ".quantity", fmt.Sprintf("a quantidade de %q deve estar entre 1 e %d", ci.Name, MaxCopies)})
			case seen[e.CardID]:
				issues = append(issues, Issue{field, fmt.Sprintf("%q aparece mais de uma vez em %s; some as quantidades", ci.Name, z.name)})
			}
			seen[e.CardID] = true
			copies[e.CardID] += e.Quantity

			if z.name == "main" && ci.IsExtraDeck {
				issues = append(issues, Issue{field, fmt.Sprintf("%q é do Extra Deck e não pode ficar no deck principal", ci.Name)})
			}
			if z.name == "extra" && !ci.IsExtraDeck {
				issues = append(issues, Issue{field, fmt.Sprintf("%q não é do Extra Deck", ci.Name)})
			}
		}
	}

	for id, n := range copies {
		ci := info[id]
		switch {
		case ci.Limit != nil && *ci.Limit == 0:
			issues = append(issues, Issue{"cards", fmt.Sprintf("%q é proibida na lista de cartas da era", ci.Name)})
		case ci.Limit != nil && n > *ci.Limit:
			issues = append(issues, Issue{"cards", fmt.Sprintf("%q é %s na lista da era: no máximo %d %s somando todas as zonas (tem %d)",
				ci.Name, limitName(*ci.Limit), *ci.Limit, copyWord(*ci.Limit), n)})
		case n > MaxCopies:
			issues = append(issues, Issue{"cards", fmt.Sprintf("%q excede o limite de %d cópias somando todas as zonas (%d)", ci.Name, MaxCopies, n)})
		}
	}

	if n := total(c.Main); n > MaxMain || (public && n < MinMain) {
		msg := fmt.Sprintf("a zona principal deve ter no máximo %d cartas (tem %d)", MaxMain, n)
		if public {
			msg = fmt.Sprintf("a zona principal precisa ter entre %d e %d cartas para um deck público (tem %d)", MinMain, MaxMain, n)
		}
		issues = append(issues, Issue{"cards.main", msg})
	}
	if n := total(c.Extra); n > MaxExtra {
		issues = append(issues, Issue{"cards.extra", fmt.Sprintf("o Extra Deck deve ter no máximo %d cartas (tem %d)", MaxExtra, n)})
	}
	if n := total(c.Side); n > MaxSide {
		issues = append(issues, Issue{"cards.side", fmt.Sprintf("o Side Deck deve ter no máximo %d cartas (tem %d)", MaxSide, n)})
	}

	sortIssues(issues)
	return issues
}

// Stats são as contagens exibidas junto do deck (main + extra).
type Stats struct {
	Monsters     int
	Spells       int
	Traps        int
	AverageLevel *float32 // nil se não houver monstros com nível
}

// ComputeStats conta monstros, magias e armadilhas e calcula o nível médio.
func ComputeStats(c Cards, info map[int64]CardInfo) Stats {
	var s Stats
	var levelSum, levelCount int
	for _, zone := range [][]Entry{c.Main, c.Extra} {
		for _, e := range zone {
			ci := info[e.CardID]
			switch {
			case strings.Contains(ci.Type, "Monster"):
				s.Monsters += e.Quantity
				if ci.Level != nil {
					levelSum += *ci.Level * e.Quantity
					levelCount += e.Quantity
				}
			case strings.Contains(ci.Type, "Spell"):
				s.Spells += e.Quantity
			case strings.Contains(ci.Type, "Trap"):
				s.Traps += e.Quantity
			}
		}
	}
	if levelCount > 0 {
		avg := float32(levelSum) / float32(levelCount)
		s.AverageLevel = &avg
	}
	return s
}

// Cover escolhe a carta de capa: a primeira do deck principal (ou do Extra, se o principal estiver vazio).
func Cover(c Cards) *int64 {
	for _, zone := range [][]Entry{c.Main, c.Extra, c.Side} {
		if len(zone) > 0 {
			id := zone[0].CardID
			return &id
		}
	}
	return nil
}

func sortIssues(is []Issue) {
	// Ordem estável e previsível (iterar map não é): campo e depois mensagem.
	sort.Slice(is, func(a, b int) bool {
		if is[a].Field != is[b].Field {
			return is[a].Field < is[b].Field
		}
		return is[a].Message < is[b].Message
	})
}
