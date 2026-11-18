package httpapi

import (
	"context"
	"fmt"
	"strings"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/deck"
)

// ListAnimeDecks lista os decks de personagens do anime disponíveis para importação.
func (a *apiServer) ListAnimeDecks(ctx context.Context, _ gen.ListAnimeDecksRequestObject) (gen.ListAnimeDecksResponseObject, error) {
	out := make(gen.ListAnimeDecks200JSONResponse, 0, len(a.anime.Decks))
	for _, d := range a.anime.Decks {
		item := gen.AnimeDeck{
			Slug: d.Slug, Character: d.Character, Series: d.Series, Description: d.Description,
			CoverCardId: d.CoverCardID, CardCount: d.Total(), Missing: append([]string{}, d.Missing...),
		}
		if c, err := a.cards.Get(ctx, d.CoverCardID); err == nil {
			u := a.imageBaseURL + "/" + c.ImageSmallPath
			item.CoverImageUrl = &u
		}
		out = append(out, item)
	}
	return out, nil
}

// ImportAnimeDeck copia um deck do anime para a conta do usuário, sempre como rascunho privado. O que a era não
// permite não derruba a importação: cartas fora do catálogo são omitidas, as cópias acima do limite da lista de
// proibidas/limitadas são reduzidas, e tudo isso é anotado na descrição.
func (a *apiServer) ImportAnimeDeck(ctx context.Context, req gen.ImportAnimeDeckRequestObject) (gen.ImportAnimeDeckResponseObject, error) {
	src, ok := a.anime.Get(req.Slug)
	if !ok {
		return gen.ImportAnimeDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck do anime não encontrado")}, nil
	}

	ids := make([]int64, len(src.Cards))
	for i, c := range src.Cards {
		ids[i] = c.CardID
	}
	infos, err := a.cards.Infos(ctx, ids)
	if err != nil {
		return nil, err
	}

	var cards deck.Cards
	absent := append([]string{}, src.Missing...)
	var reduced []string
	for _, c := range src.Cards {
		ci, found := infos[c.CardID]
		if !found {
			absent = append(absent, c.Name)
			continue
		}
		q := min(c.Quantity, a.bans.MaxCopies(c.CardID))
		if q < c.Quantity {
			reduced = append(reduced, fmt.Sprintf("%s (%d→%d)", c.Name, c.Quantity, q))
		}
		if q == 0 {
			continue
		}
		e := deck.Entry{CardID: c.CardID, Quantity: q}
		if ci.IsExtraDeck {
			cards.Extra = append(cards.Extra, e)
		} else {
			cards.Main = append(cards.Main, e)
		}
	}

	desc := src.Description + "\n\nImportado dos decks do anime (" + src.Series + "). Lista aproximada."
	if len(absent) > 0 {
		desc += "\nCartas do anime que não existem no catálogo da era: " + strings.Join(absent, ", ") + "."
	}
	if len(reduced) > 0 {
		desc += "\nAjustadas pela lista de proibidas/limitadas da era: " + strings.Join(reduced, ", ") + "."
	}

	prepared, errs, err := a.prepareDeck(ctx, gen.DeckInput{
		Name:        "Deck de " + src.Character,
		Description: &desc,
		Visibility:  "private",
		Cards:       fromDeckCards(cards),
	})
	if err != nil {
		return nil, err
	}
	if len(errs) > 0 { // não deveria acontecer: o JSON embutido é validado e as cópias foram ajustadas
		return nil, fmt.Errorf("deck do anime %q fora das regras: %v", src.Slug, errs)
	}
	me := userID(ctx)
	id, err := a.decks.Create(ctx, me, prepared)
	if err != nil {
		return nil, err
	}
	d, err := a.decks.Get(ctx, id, me)
	if err != nil {
		return nil, err
	}
	return gen.ImportAnimeDeck201JSONResponse(a.toAPIDeck(d)), nil
}
