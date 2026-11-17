package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/deck"
	"github.com/golden-era/api/internal/store"
)

const (
	defaultLimit = 30
	maxLimit     = 100
)

// CardStore é o que os handlers precisam do catálogo de cartas.
type CardStore interface {
	List(ctx context.Context, f store.CardFilter, after *store.CardCursor, limit int) ([]store.Card, bool, error)
	Get(ctx context.Context, id int64) (store.Card, error)
	Infos(ctx context.Context, ids []int64) (map[int64]deck.CardInfo, error)
	Archetypes(ctx context.Context) ([]string, error)
	Sets(ctx context.Context, until time.Time) ([]store.CardSet, error)
}

func (a *apiServer) ListCards(ctx context.Context, req gen.ListCardsRequestObject) (gen.ListCardsResponseObject, error) {
	p := req.Params

	limit := defaultLimit
	if p.Limit != nil {
		limit = *p.Limit
	}
	if limit < 1 || limit > maxLimit {
		return nil, badRequest("limit deve estar entre 1 e 100")
	}
	if p.Level != nil && (*p.Level < 1 || *p.Level > 12) {
		return nil, badRequest("level deve estar entre 1 e 12")
	}
	filter := store.CardFilter{
		Type:      nonEmpty(p.Type),
		Attribute: nonEmpty(p.Attribute),
		Race:      nonEmpty(p.Race),
		Level:     p.Level,
		Archetype: nonEmpty(p.Archetype),
	}
	if p.Ids != nil {
		if len(*p.Ids) > maxLimit {
			return nil, badRequest("ids aceita no máximo 100 passcodes")
		}
		filter.IDs = *p.Ids // vazio (`?ids=`) já é recusado com 400 pelo binding gerado
	}
	if p.Q != nil {
		if len([]rune(*p.Q)) > 100 {
			return nil, badRequest("q deve ter no máximo 100 caracteres")
		}
		filter.Query = *p.Q
	}

	var after *store.CardCursor
	if p.Cursor != nil && *p.Cursor != "" {
		c, err := decodeCursor(*p.Cursor)
		if err != nil {
			return nil, badRequest("cursor inválido")
		}
		after = &c
	}

	cards, more, err := a.cards.List(ctx, filter, after, limit)
	if err != nil {
		return nil, err
	}
	page := gen.CardPage{Items: make([]gen.Card, 0, len(cards))}
	for _, c := range cards {
		page.Items = append(page.Items, a.toAPICard(c))
	}
	if more {
		last := cards[len(cards)-1]
		next := encodeCursor(store.CardCursor{Name: last.Name, ID: last.ID})
		page.NextCursor = &next
	}
	return gen.ListCards200JSONResponse(page), nil
}

func (a *apiServer) GetCard(ctx context.Context, req gen.GetCardRequestObject) (gen.GetCardResponseObject, error) {
	c, err := a.cards.Get(ctx, req.CardId)
	if errors.Is(err, store.ErrNotFound) {
		return gen.GetCard404ApplicationProblemPlusJSONResponse{
			NotFoundApplicationProblemPlusJSONResponse: gen.NotFoundApplicationProblemPlusJSONResponse(
				newProblem(http.StatusNotFound, "carta não encontrada")),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.GetCard200JSONResponse(a.toAPICard(c)), nil
}

func (a *apiServer) ListArchetypes(ctx context.Context, _ gen.ListArchetypesRequestObject) (gen.ListArchetypesResponseObject, error) {
	list, err := a.cards.Archetypes(ctx)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []string{}
	}
	return gen.ListArchetypes200JSONResponse(list), nil
}

func (a *apiServer) ListSets(ctx context.Context, _ gen.ListSetsRequestObject) (gen.ListSetsResponseObject, error) {
	sets, err := a.cards.Sets(ctx, a.eraEnd)
	if err != nil {
		return nil, err
	}
	out := make(gen.ListSets200JSONResponse, 0, len(sets))
	for _, s := range sets {
		n := s.NumOfCards
		out = append(out, gen.CardSet{
			Code:       s.Code,
			Name:       s.Name,
			NumOfCards: &n,
			OcgDate:    toDate(s.OCGDate),
			TcgDate:    toDate(s.TCGDate),
		})
	}
	return out, nil
}

func (a *apiServer) toAPICard(c store.Card) gen.Card {
	frame := c.FrameType
	return gen.Card{
		Id:            c.ID,
		Name:          c.Name,
		Type:          c.Type,
		FrameType:     &frame,
		Desc:          c.Desc,
		Atk:           c.ATK,
		Def:           c.DEF,
		Level:         c.Level,
		Race:          c.Race,
		Attribute:     c.Attribute,
		Archetype:     c.Archetype,
		OcgDate:       toDate(c.OCGDate),
		TcgDate:       toDate(c.TCGDate),
		ImageUrl:      a.imageBaseURL + "/" + c.ImagePath,
		ImageSmallUrl: a.imageBaseURL + "/" + c.ImageSmallPath,
	}
}

func toDate(t *time.Time) *openapi_types.Date {
	if t == nil {
		return nil
	}
	return &openapi_types.Date{Time: *t}
}

func nonEmpty(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

func encodeCursor(c store.CardCursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(s string) (store.CardCursor, error) {
	var c store.CardCursor
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return c, err
	}
	return c, json.Unmarshal(b, &c)
}
