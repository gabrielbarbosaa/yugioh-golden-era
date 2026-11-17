// Package banlist guarda a lista de cartas proibidas/limitadas da era (OCG, até dez/2003).
// É código puro: a lista vem de um JSON embutido, gerado por `go run ./cmd/banlist` a partir de data/banlist/*.txt.
package banlist

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

//go:embed ocg.json
var embedded []byte

// MaxCopiesDefault é o limite de cópias de uma carta que não está na lista.
const MaxCopiesDefault = 3

// Card é uma carta com restrição: 0 = proibida, 1 = limitada, 2 = semilimitada.
type Card struct {
	CardID    int64  `json:"cardId"`
	Name      string `json:"name"`
	MaxCopies int    `json:"maxCopies"`
}

// List é uma lista de restrições em vigor numa data.
type List struct {
	Name          string `json:"name"`
	Format        string `json:"format"`
	EffectiveFrom string `json:"effectiveFrom"` // YYYY-MM-DD
	Source        string `json:"source"`
	Cards         []Card `json:"cards"`

	byID map[int64]int
}

// Parse lê e valida o JSON de uma lista.
func Parse(data []byte) (*List, error) {
	var l List
	if err := json.Unmarshal(data, &l); err != nil {
		return nil, fmt.Errorf("banlist inválida: %w", err)
	}
	l.byID = make(map[int64]int, len(l.Cards))
	for _, c := range l.Cards {
		if c.MaxCopies < 0 || c.MaxCopies >= MaxCopiesDefault {
			return nil, fmt.Errorf("banlist: %q (%d) tem limite %d fora de 0..%d", c.Name, c.CardID, c.MaxCopies, MaxCopiesDefault-1)
		}
		if _, dup := l.byID[c.CardID]; dup {
			return nil, fmt.Errorf("banlist: carta %d (%q) repetida", c.CardID, c.Name)
		}
		l.byID[c.CardID] = c.MaxCopies
	}
	return &l, nil
}

var (
	once    sync.Once
	current *List
	loadErr error
)

// Default devolve a lista embutida. O JSON embutido é conferido nos testes; um erro aqui é bug de build.
func Default() *List {
	once.Do(func() { current, loadErr = Parse(embedded) })
	if loadErr != nil {
		panic(loadErr)
	}
	return current
}

// MaxCopies devolve quantas cópias da carta o deck pode ter (3 se ela não está na lista).
func (l *List) MaxCopies(cardID int64) int {
	if n, ok := l.byID[cardID]; ok {
		return n
	}
	return MaxCopiesDefault
}

// Restricted informa se a carta tem alguma restrição.
func (l *List) Restricted(cardID int64) bool {
	_, ok := l.byID[cardID]
	return ok
}
