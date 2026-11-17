package banlist

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

// Entry é uma linha do arquivo-fonte: o nome da carta e o limite.
type Entry struct {
	Name      string
	MaxCopies int
}

var statusCopies = map[string]int{"forbidden": 0, "limited": 1, "semi": 2}

// ParseSource lê o arquivo-fonte (`<limite>\t<nome>`; `#` comenta; linhas vazias são ignoradas).
func ParseSource(r io.Reader) ([]Entry, error) {
	var out []Entry
	seen := map[string]int{}
	sc := bufio.NewScanner(r)
	for n := 1; sc.Scan(); n++ {
		line := strings.TrimRight(sc.Text(), "\r")
		if strings.TrimSpace(line) == "" || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		status, name, ok := strings.Cut(line, "\t")
		name = strings.TrimSpace(name)
		copies, known := statusCopies[strings.TrimSpace(status)]
		if !ok || !known || name == "" {
			return nil, fmt.Errorf("linha %d: esperava `forbidden|limited|semi<TAB>nome`, veio %q", n, line)
		}
		key := strings.ToLower(name)
		if first, dup := seen[key]; dup {
			return nil, fmt.Errorf("linha %d: %q já aparece na linha %d", n, name, first)
		}
		seen[key] = n
		out = append(out, Entry{Name: name, MaxCopies: copies})
	}
	return out, sc.Err()
}
