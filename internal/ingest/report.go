package ingest

import (
	"fmt"
	"sort"
	"strings"
)

// Cartas emblemáticas da era usadas como conferência rápida do corte.
var landmarkCards = []string{
	"Dark Magician",
	"Blue-Eyes White Dragon",
	"Exodia the Forbidden One",
	"Kuriboh",
	"Time Wizard",
	"Red-Eyes Black Dragon",
	"Summoned Skull",
}

// Report resume o resultado da ingestão para uma conferência humana.
type Report struct {
	Era          Era
	Total        int
	Monsters     int
	ExtraDeck    int
	Spells       int
	Traps        int
	Archetypes   int
	EarliestOCG  string
	LatestOCG    string
	MissingDates int
	OutsideEra   int
	Landmarks    map[string]bool
	Warnings     []string
}

// BuildReport calcula estatísticas e avisos a partir das cartas.
func BuildReport(cards []Card, era Era) Report {
	r := Report{Era: era, Total: len(cards), Landmarks: map[string]bool{}}
	for _, n := range landmarkCards {
		r.Landmarks[n] = false
	}
	arch := map[string]struct{}{}

	for _, c := range cards {
		switch {
		case c.IsExtraDeck:
			r.ExtraDeck++
		case strings.Contains(c.Type, "Monster"):
			r.Monsters++
		case strings.Contains(c.Type, "Spell"):
			r.Spells++
		case strings.Contains(c.Type, "Trap"):
			r.Traps++
		}
		if c.Archetype != "" {
			arch[c.Archetype] = struct{}{}
		}
		if _, ok := r.Landmarks[c.Name]; ok {
			r.Landmarks[c.Name] = true
		}

		date := c.OCGDate
		if era.Region == "tcg" {
			date = c.TCGDate
		}
		if date == "" {
			r.MissingDates++
			continue
		}
		if r.EarliestOCG == "" || date < r.EarliestOCG {
			r.EarliestOCG = date
		}
		if date > r.LatestOCG {
			r.LatestOCG = date
		}
		if date < era.Start || date > era.End {
			r.OutsideEra++
		}
	}
	r.Archetypes = len(arch)

	if r.Total == 0 {
		r.Warnings = append(r.Warnings, "nenhuma carta retornada: confira região e datas")
	}
	if r.OutsideEra > 0 {
		r.Warnings = append(r.Warnings, fmt.Sprintf("%d carta(s) com data fora da janela configurada", r.OutsideEra))
	}
	if r.MissingDates > 0 {
		r.Warnings = append(r.Warnings, fmt.Sprintf("%d carta(s) sem data de lançamento na região %s", r.MissingDates, strings.ToUpper(era.Region)))
	}
	var missing []string
	for n, ok := range r.Landmarks {
		if !ok {
			missing = append(missing, n)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		r.Warnings = append(r.Warnings, "cartas emblemáticas ausentes: "+strings.Join(missing, ", "))
	}
	return r
}

// String formata o relatório para o terminal.
func (r Report) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "Era: %s de %s até %s\n", strings.ToUpper(r.Era.Region), r.Era.Start, r.Era.End)
	fmt.Fprintf(&b, "Total de cartas: %d\n", r.Total)
	fmt.Fprintf(&b, "  Monstros (main): %d\n  Monstros (extra deck): %d\n  Magias: %d\n  Armadilhas: %d\n",
		r.Monsters, r.ExtraDeck, r.Spells, r.Traps)
	fmt.Fprintf(&b, "Arquétipos distintos: %d\n", r.Archetypes)
	fmt.Fprintf(&b, "Datas na região: de %s a %s\n", orDash(r.EarliestOCG), orDash(r.LatestOCG))

	b.WriteString("Cartas emblemáticas:\n")
	names := make([]string, 0, len(r.Landmarks))
	for n := range r.Landmarks {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		mark := "ok"
		if !r.Landmarks[n] {
			mark = "AUSENTE"
		}
		fmt.Fprintf(&b, "  [%s] %s\n", mark, n)
	}
	if len(r.Warnings) == 0 {
		b.WriteString("Sem avisos.\n")
	} else {
		b.WriteString("Avisos:\n")
		for _, w := range r.Warnings {
			fmt.Fprintf(&b, "  - %s\n", w)
		}
	}
	return b.String()
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}
