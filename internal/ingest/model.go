// Package ingest baixa o catálogo de cartas da era configurada e as imagens correspondentes.
//
// O pacote usa apenas a biblioteca padrão: ele produz arquivos locais (cards.json, sets.json e
// imagens) que um passo posterior importa no PostgreSQL.
package ingest

import (
	"strconv"
	"strings"
	"time"
)

// Era define a janela de lançamento das cartas que entram no catálogo.
type Era struct {
	Region string `json:"region"` // "ocg" ou "tcg"
	Start  string `json:"start"`  // YYYY-MM-DD
	End    string `json:"end"`    // YYYY-MM-DD
}

// Validate confere região e datas.
func (e Era) Validate() error {
	if e.Region != "ocg" && e.Region != "tcg" {
		return &ConfigError{"região inválida " + quote(e.Region) + " (use ocg ou tcg)"}
	}
	start, err := time.Parse(time.DateOnly, e.Start)
	if err != nil {
		return &ConfigError{"data inicial inválida " + quote(e.Start) + " (use YYYY-MM-DD)"}
	}
	end, err := time.Parse(time.DateOnly, e.End)
	if err != nil {
		return &ConfigError{"data final inválida " + quote(e.End) + " (use YYYY-MM-DD)"}
	}
	if end.Before(start) {
		return &ConfigError{"a data final é anterior à inicial"}
	}
	return nil
}

// ConfigError indica configuração inválida.
type ConfigError struct{ Msg string }

func (e *ConfigError) Error() string { return e.Msg }

func quote(s string) string { return `"` + s + `"` }

// APICard reflete o formato devolvido pelo endpoint cardinfo.php (v7) do YGOPRODeck.
type APICard struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	FrameType string `json:"frameType"`
	Desc      string `json:"desc"`
	ATK       *int   `json:"atk"`
	DEF       *int   `json:"def"`
	Level     *int   `json:"level"`
	Race      string `json:"race"`
	Attribute string `json:"attribute"`
	Archetype string `json:"archetype"`
	CardSets  []struct {
		SetName   string `json:"set_name"`
		SetCode   string `json:"set_code"`
		SetRarity string `json:"set_rarity"`
	} `json:"card_sets"`
	CardImages []struct {
		ID            int64  `json:"id"`
		ImageURL      string `json:"image_url"`
		ImageURLSmall string `json:"image_url_small"`
	} `json:"card_images"`
	MiscInfo []struct {
		TCGDate string `json:"tcg_date"`
		OCGDate string `json:"ocg_date"`
	} `json:"misc_info"`
}

// APISet reflete o formato de cardsets.php.
type APISet struct {
	SetName    string `json:"set_name"`
	SetCode    string `json:"set_code"`
	NumOfCards int    `json:"num_of_cards"`
	TCGDate    string `json:"tcg_date"`
}

// Print representa uma impressão da carta em um set.
type Print struct {
	PrintCode string `json:"printCode"` // ex.: LOB-EN005
	SetCode   string `json:"setCode"`   // ex.: LOB
	SetName   string `json:"setName"`
	Rarity    string `json:"rarity"`
}

// Card é o formato que o projeto guarda em cards.json.
type Card struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	Type           string  `json:"type"`
	FrameType      string  `json:"frameType"`
	Desc           string  `json:"desc"`
	ATK            *int    `json:"atk"`
	DEF            *int    `json:"def"`
	Level          *int    `json:"level"`
	Race           string  `json:"race"`
	Attribute      string  `json:"attribute"`
	Archetype      string  `json:"archetype"`
	IsExtraDeck    bool    `json:"isExtraDeck"`
	OCGDate        string  `json:"ocgDate"`
	TCGDate        string  `json:"tcgDate"`
	ImageURL       string  `json:"imageUrl"`      // origem, usada só para o download
	ImageSmallURL  string  `json:"imageSmallUrl"` // origem, usada só para o download
	ImageFile      string  `json:"imageFile"`     // caminho relativo, ex.: cards/46986414.jpg
	ImageSmallFile string  `json:"imageSmallFile"`
	Prints         []Print `json:"prints"`
}

// CardsFile é o conteúdo de cards.json.
type CardsFile struct {
	GeneratedAt time.Time `json:"generatedAt"`
	Source      string    `json:"source"`
	Era         Era       `json:"era"`
	Cards       []Card    `json:"cards"`
}

// ToCards converte o formato da API para o formato do projeto, de forma determinística.
func ToCards(in []APICard) []Card {
	out := make([]Card, 0, len(in))
	for _, a := range in {
		c := Card{
			ID:          a.ID,
			Name:        a.Name,
			Type:        a.Type,
			FrameType:   a.FrameType,
			Desc:        a.Desc,
			ATK:         a.ATK,
			DEF:         a.DEF,
			Level:       a.Level,
			Race:        a.Race,
			Attribute:   a.Attribute,
			Archetype:   a.Archetype,
			IsExtraDeck: isExtraDeckType(a.Type),
		}
		if len(a.MiscInfo) > 0 {
			c.OCGDate = a.MiscInfo[0].OCGDate
			c.TCGDate = a.MiscInfo[0].TCGDate
		}
		if len(a.CardImages) > 0 {
			c.ImageURL = a.CardImages[0].ImageURL
			c.ImageSmallURL = a.CardImages[0].ImageURLSmall
		}
		c.ImageFile = "cards/" + strconv.FormatInt(a.ID, 10) + ".jpg"
		c.ImageSmallFile = "cards_small/" + strconv.FormatInt(a.ID, 10) + ".jpg"
		for _, s := range a.CardSets {
			c.Prints = append(c.Prints, Print{
				PrintCode: s.SetCode,
				SetCode:   setPrefix(s.SetCode),
				SetName:   s.SetName,
				Rarity:    s.SetRarity,
			})
		}
		out = append(out, c)
	}
	return out
}

func isExtraDeckType(t string) bool {
	for _, k := range []string{"Fusion", "Synchro", "XYZ", "Link"} {
		if strings.Contains(t, k) {
			return true
		}
	}
	return false
}

func setPrefix(printCode string) string {
	if i := strings.Index(printCode, "-"); i > 0 {
		return printCode[:i]
	}
	return printCode
}
