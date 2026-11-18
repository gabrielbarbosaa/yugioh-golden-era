package animedecks

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

// Entry é uma linha de carta do arquivo-fonte.
type Entry struct {
	Name     string
	Quantity int
}

// Source é um deck no arquivo-fonte, ainda com nomes de carta.
type Source struct {
	Slug        string
	Character   string
	Series      string
	Description string
	Cover       string // nome da carta de capa; vazio = a primeira
	Entries     []Entry
}

var entryRe = regexp.MustCompile(`^(\d)\s*x?\s+(.+)$`)

// ParseSource lê um arquivo-fonte: cabeçalho `chave: valor` (slug, personagem, serie, descricao, capa) e depois
// uma carta por linha (`3 Blue-Eyes White Dragon`). `#` comenta; linhas vazias são ignoradas.
func ParseSource(r io.Reader) (Source, error) {
	var s Source
	seen := map[string]int{}
	sc := bufio.NewScanner(r)
	for n := 1; sc.Scan(); n++ {
		line := strings.TrimSpace(strings.TrimRight(sc.Text(), "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if m := entryRe.FindStringSubmatch(line); m != nil {
			q, _ := strconv.Atoi(m[1])
			name := strings.TrimSpace(m[2])
			if q < 1 || q > 3 {
				return s, fmt.Errorf("linha %d: quantidade %d fora de 1..3", n, q)
			}
			key := strings.ToLower(name)
			if first, dup := seen[key]; dup {
				return s, fmt.Errorf("linha %d: %q já aparece na linha %d", n, name, first)
			}
			seen[key] = n
			s.Entries = append(s.Entries, Entry{Name: name, Quantity: q})
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			return s, fmt.Errorf("linha %d: esperava `chave: valor` ou `<quantidade> <carta>`, veio %q", n, line)
		}
		val = strings.TrimSpace(val)
		switch strings.TrimSpace(key) {
		case "slug":
			s.Slug = val
		case "personagem":
			s.Character = val
		case "serie":
			s.Series = val
		case "descricao":
			s.Description = val
		case "capa":
			s.Cover = val
		default:
			return s, fmt.Errorf("linha %d: chave desconhecida %q", n, key)
		}
	}
	if err := sc.Err(); err != nil {
		return s, err
	}
	if s.Slug == "" || s.Character == "" || len(s.Entries) == 0 {
		return s, fmt.Errorf("faltam slug, personagem ou cartas")
	}
	return s, nil
}
