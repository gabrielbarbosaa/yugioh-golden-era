package ingest

import (
	"bytes"
	"strings"
	"testing"
)

func intp(n int) *int { return &n }

func sampleCards() []Card {
	return []Card{
		{
			ID: 2, Name: "Gaia The Fierce Knight's Charge", Type: "Normal Monster", FrameType: "normal",
			Desc: "Linha 1\nLinha 2 com 'aspas'", ATK: intp(2300), DEF: intp(2100), Level: intp(7),
			Race: "Warrior", Attribute: "EARTH", OCGDate: "1999-02-04",
			ImageFile: "cards/2.jpg", ImageSmallFile: "cards_small/2.jpg",
			Prints: []Print{
				{PrintCode: "LOB-EN001", SetCode: "LOB", SetName: "Legend of Blue Eyes White Dragon", Rarity: "Ultra Rare"},
				{PrintCode: "LOB-EN001", SetCode: "LOB", SetName: "Legend of Blue Eyes White Dragon", Rarity: "Ultra Rare"}, // duplicada
				{PrintCode: "LOB-EN001", SetCode: "LOB", SetName: "Legend of Blue Eyes White Dragon", Rarity: "Common"},
			},
		},
		{
			ID: 1, Name: "Mystical Space Typhoon", Type: "Spell Card", FrameType: "spell",
			Race: "Quick-Play", OCGDate: "2002-05-23",
			ImageFile: "cards/1.jpg", ImageSmallFile: "cards_small/1.jpg",
			Prints: []Print{{PrintCode: "SDY-046", SetCode: "SDY", SetName: "Starter Deck: Yugi", Rarity: "Common"}},
		},
	}
}

func sampleSets() []APISet {
	return []APISet{
		{SetName: "Legend of Blue Eyes White Dragon", SetCode: "LOB", NumOfCards: 126, TCGDate: "2002-03-08"},
		{SetName: "Set Fora da Era", SetCode: "ZZZ", NumOfCards: 10, TCGDate: "2020-01-01"},
	}
}

func generate(t *testing.T, cards []Card, sets []APISet) (string, SQLStats) {
	t.Helper()
	var buf bytes.Buffer
	stats, err := WriteImportSQL(&buf, cards, sets)
	if err != nil {
		t.Fatal(err)
	}
	return buf.String(), stats
}

func TestWriteImportSQLContent(t *testing.T) {
	sql, stats := generate(t, sampleCards(), sampleSets())

	if stats.Cards != 2 || stats.Sets != 2 || stats.Prints != 3 {
		t.Fatalf("stats = %+v, esperado 2 cartas, 2 sets, 3 impressões (1 duplicada removida)", stats)
	}
	// Transação e idempotência.
	for _, want := range []string{"BEGIN;", "COMMIT;", "ON CONFLICT (id) DO UPDATE", "ON CONFLICT (code) DO UPDATE", "DELETE FROM card_prints;"} {
		if !strings.Contains(sql, want) {
			t.Errorf("SQL sem %q", want)
		}
	}
	// Escape de aspas e preservação de quebras de linha.
	if !strings.Contains(sql, `'Gaia The Fierce Knight''s Charge'`) {
		t.Error("aspas do nome não foram escapadas")
	}
	if !strings.Contains(sql, "'Linha 1\nLinha 2 com ''aspas'''") {
		t.Error("descrição mal escapada")
	}
	// NULLs e datas tipadas.
	if !strings.Contains(sql, "NULL, NULL, NULL") { // atk, def, level da magia
		t.Error("campos numéricos ausentes deveriam ser NULL")
	}
	if !strings.Contains(sql, "DATE '1999-02-04'") {
		t.Error("data OCG ausente")
	}
	// Caminhos relativos de imagem.
	if !strings.Contains(sql, "'cards/2.jpg', 'cards_small/2.jpg'") {
		t.Error("caminhos de imagem ausentes")
	}
	// Só entram sets referenciados por cartas.
	if strings.Contains(sql, "ZZZ") || strings.Contains(sql, "Set Fora da Era") {
		t.Error("set não referenciado não deveria entrar")
	}
	// Dados do sets.json enriquecem o set.
	if !strings.Contains(sql, "'LOB', 'Legend of Blue Eyes White Dragon', NULL, DATE '2002-03-08', 126") {
		t.Error("set LOB deveria usar os dados de sets.json")
	}
	// Set sem entrada em sets.json usa o nome da impressão e data nula.
	if !strings.Contains(sql, "'SDY', 'Starter Deck: Yugi', NULL, NULL, 0") {
		t.Error("set SDY deveria cair no nome da impressão")
	}
	// Ordem determinística por id e sets antes de cards antes de prints.
	if strings.Index(sql, "(1, 'Mystical") > strings.Index(sql, "(2, 'Gaia") {
		t.Error("cartas deveriam estar ordenadas por id")
	}
	i1 := strings.Index(sql, "INSERT INTO card_sets")
	i2 := strings.Index(sql, "INSERT INTO cards ")
	i3 := strings.Index(sql, "INSERT INTO card_prints")
	if !(i1 >= 0 && i1 < i2 && i2 < i3) {
		t.Errorf("ordem inesperada: sets=%d cards=%d prints=%d", i1, i2, i3)
	}
}

func TestWriteImportSQLIsDeterministic(t *testing.T) {
	a, _ := generate(t, sampleCards(), sampleSets())
	b, _ := generate(t, sampleCards(), sampleSets())
	if a != b {
		t.Error("saída deveria ser idêntica entre execuções")
	}
}

func TestWriteImportSQLBatches(t *testing.T) {
	var cards []Card
	for i := 1; i <= cardsPerStatement+1; i++ {
		cards = append(cards, Card{ID: int64(i), Name: "c", Type: "Normal Monster", ImageFile: "a", ImageSmallFile: "b"})
	}
	sql, _ := generate(t, cards, nil)
	if got := strings.Count(sql, "INSERT INTO cards "); got != 2 {
		t.Errorf("INSERTs de cards = %d, esperado 2 (lotes de %d)", got, cardsPerStatement)
	}
}

func TestWriteImportSQLRejectsBadDate(t *testing.T) {
	cards := []Card{{ID: 1, Name: "x", Type: "t", OCGDate: "1999'; DROP TABLE cards;--"}}
	var buf bytes.Buffer
	if _, err := WriteImportSQL(&buf, cards, nil); err == nil {
		t.Fatal("esperava erro para data inválida")
	}
}

func TestWriteImportSQLEmptyIsValidScript(t *testing.T) {
	sql, stats := generate(t, nil, nil)
	if stats != (SQLStats{}) || !strings.Contains(sql, "BEGIN;") || !strings.Contains(sql, "COMMIT;") {
		t.Errorf("script vazio inválido: %q %+v", sql, stats)
	}
}
