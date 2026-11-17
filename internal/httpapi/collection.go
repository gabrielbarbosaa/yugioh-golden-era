package httpapi

import (
	"context"
	"fmt"
	"sort"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/store"
)

const (
	maxCollectionItems = 5000
	maxCollectionQty   = 999
)

// CollectionStore é o que os handlers precisam da coleção pessoal.
type CollectionStore interface {
	Get(ctx context.Context, userID string) ([]store.CollectionItem, error)
	Replace(ctx context.Context, userID string, items []store.CollectionItem) error
}

func toAPICollection(items []store.CollectionItem) []gen.CollectionItem {
	out := make([]gen.CollectionItem, len(items)) // nunca nil: o JSON sai como [] e não null
	for i, it := range items {
		out[i] = gen.CollectionItem{CardId: it.CardID, Quantity: it.Quantity}
	}
	return out
}

func (a *apiServer) GetMyCollection(ctx context.Context, _ gen.GetMyCollectionRequestObject) (gen.GetMyCollectionResponseObject, error) {
	items, err := a.collection.Get(ctx, userID(ctx))
	if err != nil {
		return nil, err
	}
	return gen.GetMyCollection200JSONResponse(toAPICollection(items)), nil
}

func (a *apiServer) ReplaceMyCollection(ctx context.Context, req gen.ReplaceMyCollectionRequestObject) (gen.ReplaceMyCollectionResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	unprocessable := func(errs []fieldError) gen.ReplaceMyCollectionResponseObject {
		return gen.ReplaceMyCollection422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("coleção inválida", errs)}
	}

	body := *req.Body
	if len(body) > maxCollectionItems {
		return unprocessable([]fieldError{{"", fmt.Sprintf("a coleção aceita no máximo %d cartas distintas", maxCollectionItems)}}), nil
	}

	var errs []fieldError
	seen := make(map[int64]bool, len(body))
	ids := make([]int64, 0, len(body))
	items := make([]store.CollectionItem, 0, len(body))
	for i, it := range body {
		field := fmt.Sprintf("[%d]", i)
		switch {
		case it.Quantity < 0 || it.Quantity > maxCollectionQty:
			errs = append(errs, fieldError{field + ".quantity", fmt.Sprintf("a quantidade deve estar entre 0 e %d", maxCollectionQty)})
		case seen[it.CardId]:
			errs = append(errs, fieldError{field + ".cardId", fmt.Sprintf("a carta %d aparece mais de uma vez", it.CardId)})
		}
		if !seen[it.CardId] {
			ids = append(ids, it.CardId)
		}
		seen[it.CardId] = true
		items = append(items, store.CollectionItem{CardID: it.CardId, Quantity: it.Quantity})
	}
	if len(errs) == 0 {
		infos, err := a.cards.Infos(ctx, ids)
		if err != nil {
			return nil, err
		}
		for i, it := range body {
			if _, ok := infos[it.CardId]; !ok {
				errs = append(errs, fieldError{fmt.Sprintf("[%d].cardId", i), fmt.Sprintf("a carta %d não existe no catálogo da era", it.CardId)})
			}
		}
	}
	if len(errs) > 0 {
		return unprocessable(errs), nil
	}

	sort.Slice(items, func(i, j int) bool { return items[i].CardID < items[j].CardID })
	me := userID(ctx)
	if err := a.collection.Replace(ctx, me, items); err != nil {
		return nil, err
	}
	saved, err := a.collection.Get(ctx, me)
	if err != nil {
		return nil, err
	}
	return gen.ReplaceMyCollection200JSONResponse(toAPICollection(saved)), nil
}
