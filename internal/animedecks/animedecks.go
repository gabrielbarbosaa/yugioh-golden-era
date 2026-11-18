// Package animedecks guarda decks de personagens do anime (era Duel Monsters) que o usuário pode importar para a conta.
// É código puro: os decks vêm de um JSON embutido, gerado por `go run ./cmd/animedecks` a partir de data/anime-decks/*.txt.
package animedecks

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"sync"
)

//go:embed decks.json
var embedded []byte

// Card é uma carta do deck já resolvida no catálogo.
type Card struct {
	CardID   int64  `json:"cardId"`
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
}

// Deck é o deck de um personagem. `Missing` lista as cartas do deck no anime que não existem no catálogo da era.
type Deck struct {
	Slug        string   `json:"slug"`
	Character   string   `json:"character"`
	Series      string   `json:"series"`
	Description string   `json:"description"`
	CoverCardID int64    `json:"coverCardId"`
	Cards       []Card   `json:"cards"`
	Missing     []string `json:"missing"`
}

// Total soma as cópias das cartas encontradas.
func (d Deck) Total() int {
	n := 0
	for _, c := range d.Cards {
		n += c.Quantity
	}
	return n
}

// Collection é o conjunto de decks disponíveis.
type Collection struct {
	Decks []Deck `json:"decks"`

	bySlug map[string]int
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Parse lê e valida o JSON da coleção.
func Parse(data []byte) (*Collection, error) {
	var c Collection
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("decks de anime inválidos: %w", err)
	}
	c.bySlug = make(map[string]int, len(c.Decks))
	for i, d := range c.Decks {
		if !slugRe.MatchString(d.Slug) {
			return nil, fmt.Errorf("deck %q: slug inválido", d.Slug)
		}
		if _, dup := c.bySlug[d.Slug]; dup {
			return nil, fmt.Errorf("deck %q repetido", d.Slug)
		}
		if d.Character == "" || len(d.Cards) == 0 {
			return nil, fmt.Errorf("deck %q: precisa de personagem e de cartas", d.Slug)
		}
		seen := map[int64]bool{}
		for _, card := range d.Cards {
			if card.Quantity < 1 || card.Quantity > 3 {
				return nil, fmt.Errorf("deck %q: %q com %d cópias (use 1 a 3)", d.Slug, card.Name, card.Quantity)
			}
			if seen[card.CardID] {
				return nil, fmt.Errorf("deck %q: carta %d (%q) repetida", d.Slug, card.CardID, card.Name)
			}
			seen[card.CardID] = true
		}
		c.bySlug[d.Slug] = i
	}
	return &c, nil
}

var (
	once    sync.Once
	current *Collection
	loadErr error
)

// Default devolve a coleção embutida. O JSON é conferido nos testes; um erro aqui é bug de build.
func Default() *Collection {
	once.Do(func() { current, loadErr = Parse(embedded) })
	if loadErr != nil {
		panic(loadErr)
	}
	return current
}

// Get devolve o deck pelo slug.
func (c *Collection) Get(slug string) (Deck, bool) {
	i, ok := c.bySlug[slug]
	if !ok {
		return Deck{}, false
	}
	return c.Decks[i], true
}
