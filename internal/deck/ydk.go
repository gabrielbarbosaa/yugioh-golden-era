package deck

import (
	"fmt"
	"strconv"
	"strings"
)

// ParseYDK lê o formato .ydk: seções "#main", "#extra" e "!side", com um passcode por linha
// (cartas repetidas somam a quantidade). Linhas "#created by ..." e vazias são ignoradas.
func ParseYDK(text string) (Cards, []Issue) {
	var (
		c       Cards
		issues  []Issue
		section string
	)
	counts := map[string]map[int64]int{"main": {}, "extra": {}, "side": {}}
	order := map[string][]int64{}

	for n, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(line, "\xef\xbb\xbf"))
		switch strings.ToLower(line) {
		case "":
			continue
		case "#main":
			section = "main"
			continue
		case "#extra":
			section = "extra"
			continue
		case "!side":
			section = "side"
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue // comentário, como "#created by ..."
		}
		id, err := strconv.ParseInt(line, 10, 64)
		if err != nil || id <= 0 {
			issues = append(issues, Issue{fmt.Sprintf("linha %d", n+1), fmt.Sprintf("passcode inválido %q", line)})
			continue
		}
		if section == "" {
			issues = append(issues, Issue{fmt.Sprintf("linha %d", n+1), "carta fora de uma seção (#main, #extra ou !side)"})
			continue
		}
		if counts[section][id] == 0 {
			order[section] = append(order[section], id)
		}
		counts[section][id]++
	}

	build := func(sec string) []Entry {
		out := make([]Entry, 0, len(order[sec]))
		for _, id := range order[sec] {
			out = append(out, Entry{CardID: id, Quantity: counts[sec][id]})
		}
		return out
	}
	c.Main, c.Extra, c.Side = build("main"), build("extra"), build("side")
	return c, issues
}

// FormatYDK gera o conteúdo de um arquivo .ydk.
func FormatYDK(c Cards, createdBy string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "#created by %s\n", createdBy)
	write := func(header string, es []Entry) {
		b.WriteString(header + "\n")
		for _, e := range es {
			for i := 0; i < e.Quantity; i++ {
				fmt.Fprintf(&b, "%d\n", e.CardID)
			}
		}
	}
	write("#main", c.Main)
	write("#extra", c.Extra)
	write("!side", c.Side)
	return b.String()
}
