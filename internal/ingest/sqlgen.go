package ingest

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
)

const (
	cardsPerStatement  = 200
	printsPerStatement = 500
)

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// SQLStats resume o que foi escrito no script de importação.
type SQLStats struct {
	Cards  int
	Sets   int
	Prints int
}

// WriteImportSQL escreve um script SQL idempotente que carrega cards, card_sets e card_prints.
//
// O script roda dentro de uma transação e pode ser executado várias vezes: cartas e sets usam
// upsert, e card_prints (derivada só da ingestão) é recriada. Cartas que saíram do catálogo não
// são removidas, porque decks podem referenciá-las.
//
// Em cards.image_path e cards.image_small_path ficam apenas caminhos relativos; a URL base é
// responsabilidade da API (IMAGE_BASE_URL).
func WriteImportSQL(w io.Writer, cards []Card, sets []APISet) (SQLStats, error) {
	cards = append([]Card(nil), cards...)
	sort.Slice(cards, func(i, j int) bool { return cards[i].ID < cards[j].ID })

	setInfo := make(map[string]APISet, len(sets))
	for _, s := range sets {
		setInfo[s.SetCode] = s
	}

	// Sets referenciados pelas cartas da era e prints sem duplicatas.
	type printKey struct {
		card   int64
		code   string
		rarity string
	}
	usedSets := map[string]string{} // código -> nome
	seen := map[printKey]bool{}
	var prints []struct {
		card int64
		p    Print
	}
	for _, c := range cards {
		for _, p := range c.Prints {
			if p.PrintCode == "" || p.SetCode == "" {
				continue
			}
			k := printKey{c.ID, p.PrintCode, p.Rarity}
			if seen[k] {
				continue
			}
			seen[k] = true
			prints = append(prints, struct {
				card int64
				p    Print
			}{c.ID, p})
			if _, ok := usedSets[p.SetCode]; !ok {
				usedSets[p.SetCode] = p.SetName
			}
		}
	}
	setCodes := make([]string, 0, len(usedSets))
	for code := range usedSets {
		setCodes = append(setCodes, code)
	}
	sort.Strings(setCodes)

	bw := bufio.NewWriter(w)
	stats := SQLStats{Cards: len(cards), Sets: len(setCodes), Prints: len(prints)}

	fmt.Fprintf(bw, "-- Gerado por cmd/sqlgen. Idempotente; pode ser executado várias vezes.\n")
	fmt.Fprintf(bw, "-- %d cartas, %d sets, %d impressões.\n", stats.Cards, stats.Sets, stats.Prints)
	fmt.Fprintf(bw, "BEGIN;\n\n")

	// --- card_sets
	for start := 0; start < len(setCodes); start += cardsPerStatement {
		end := min(start+cardsPerStatement, len(setCodes))
		fmt.Fprintf(bw, "INSERT INTO card_sets (code, name, ocg_date, tcg_date, num_of_cards) VALUES\n")
		for i, code := range setCodes[start:end] {
			info := setInfo[code]
			name := usedSets[code]
			if info.SetName != "" {
				name = info.SetName
			}
			tcg, err := sqlDate(info.TCGDate)
			if err != nil {
				return stats, fmt.Errorf("set %s: %w", code, err)
			}
			fmt.Fprintf(bw, "  (%s, %s, NULL, %s, %d)%s\n", sqlStr(code), sqlStr(name), tcg, info.NumOfCards, sep(i, end-start))
		}
		fmt.Fprintf(bw, "ON CONFLICT (code) DO UPDATE SET\n  name = EXCLUDED.name,\n  tcg_date = EXCLUDED.tcg_date,\n  num_of_cards = EXCLUDED.num_of_cards;\n\n")
	}

	// --- cards
	for start := 0; start < len(cards); start += cardsPerStatement {
		end := min(start+cardsPerStatement, len(cards))
		fmt.Fprintf(bw, "INSERT INTO cards (id, name, type, frame_type, description, atk, def, level, race, attribute, archetype, is_extra_deck, ocg_date, tcg_date, image_path, image_small_path) VALUES\n")
		for i, c := range cards[start:end] {
			ocg, err := sqlDate(c.OCGDate)
			if err != nil {
				return stats, fmt.Errorf("carta %d: %w", c.ID, err)
			}
			tcg, err := sqlDate(c.TCGDate)
			if err != nil {
				return stats, fmt.Errorf("carta %d: %w", c.ID, err)
			}
			fmt.Fprintf(bw, "  (%d, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %t, %s, %s, %s, %s)%s\n",
				c.ID, sqlStr(c.Name), sqlStr(c.Type), sqlStr(c.FrameType), sqlStr(c.Desc),
				sqlInt(c.ATK), sqlInt(c.DEF), sqlInt(c.Level),
				sqlNullStr(c.Race), sqlNullStr(c.Attribute), sqlNullStr(c.Archetype),
				c.IsExtraDeck, ocg, tcg, sqlStr(c.ImageFile), sqlStr(c.ImageSmallFile),
				sep(i, end-start))
		}
		fmt.Fprintf(bw, "ON CONFLICT (id) DO UPDATE SET\n")
		fmt.Fprintf(bw, "  name = EXCLUDED.name, type = EXCLUDED.type, frame_type = EXCLUDED.frame_type,\n")
		fmt.Fprintf(bw, "  description = EXCLUDED.description, atk = EXCLUDED.atk, def = EXCLUDED.def, level = EXCLUDED.level,\n")
		fmt.Fprintf(bw, "  race = EXCLUDED.race, attribute = EXCLUDED.attribute, archetype = EXCLUDED.archetype,\n")
		fmt.Fprintf(bw, "  is_extra_deck = EXCLUDED.is_extra_deck, ocg_date = EXCLUDED.ocg_date, tcg_date = EXCLUDED.tcg_date,\n")
		fmt.Fprintf(bw, "  image_path = EXCLUDED.image_path, image_small_path = EXCLUDED.image_small_path, updated_at = now();\n\n")
	}

	// --- card_prints (recriada a cada importação)
	fmt.Fprintf(bw, "DELETE FROM card_prints;\n\n")
	for start := 0; start < len(prints); start += printsPerStatement {
		end := min(start+printsPerStatement, len(prints))
		fmt.Fprintf(bw, "INSERT INTO card_prints (card_id, print_code, set_code, rarity) VALUES\n")
		for i, p := range prints[start:end] {
			fmt.Fprintf(bw, "  (%d, %s, %s, %s)%s\n", p.card, sqlStr(p.p.PrintCode), sqlStr(p.p.SetCode), sqlStr(p.p.Rarity), sep(i, end-start))
		}
		fmt.Fprintf(bw, "ON CONFLICT DO NOTHING;\n\n")
	}

	fmt.Fprintf(bw, "COMMIT;\n")
	return stats, bw.Flush()
}

// sep devolve a vírgula entre linhas de um VALUES; a última linha não leva separador.
func sep(i, n int) string {
	if i == n-1 {
		return ""
	}
	return ","
}

func sqlStr(s string) string {
	return "'" + strings.ReplaceAll(strings.ReplaceAll(s, "\x00", ""), "'", "''") + "'"
}

func sqlNullStr(s string) string {
	if s == "" {
		return "NULL"
	}
	return sqlStr(s)
}

func sqlInt(p *int) string {
	if p == nil {
		return "NULL"
	}
	return fmt.Sprintf("%d", *p)
}

func sqlDate(s string) (string, error) {
	if s == "" {
		return "NULL", nil
	}
	if !dateRe.MatchString(s) {
		return "", fmt.Errorf("data inválida %q", s)
	}
	return "DATE '" + s + "'", nil
}
