package httpapi

import (
	"context"
	"errors"
	"strings"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/store"
)

// pageParams valida limit e cursor (o cursor de usuários é o último username da página anterior).
func pageParams(limit *gen.Limit, cursor *gen.Cursor) (int, string, error) {
	n := defaultLimit
	if limit != nil {
		n = int(*limit)
	}
	if n < 1 || n > maxLimit {
		return 0, "", badRequest("limit deve estar entre 1 e 100")
	}
	after := ""
	if cursor != nil {
		after = string(*cursor)
		if after != "" && !usernameRE.MatchString(after) {
			return 0, "", badRequest("cursor inválido")
		}
	}
	return n, after, nil
}

func (a *apiServer) toUserPage(items []store.DeckOwner, more bool) gen.UserPage {
	page := gen.UserPage{Items: make([]gen.UserSummary, 0, len(items))}
	for _, o := range items {
		page.Items = append(page.Items, a.userSummary(o))
	}
	if more && len(items) > 0 {
		next := items[len(items)-1].Username
		page.NextCursor = &next
	}
	return page
}

func (a *apiServer) SearchUsers(ctx context.Context, req gen.SearchUsersRequestObject) (gen.SearchUsersResponseObject, error) {
	limit, after, err := pageParams(req.Params.Limit, req.Params.Cursor)
	if err != nil {
		return nil, err
	}
	q := strings.TrimSpace(req.Params.Q)
	if n := len([]rune(q)); n < 1 || n > 24 {
		return gen.SearchUsers422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("busca inválida",
				[]fieldError{{"q", "informe de 1 a 24 caracteres"}}),
		}, nil
	}
	items, more, err := a.users.Search(ctx, q, after, limit)
	if err != nil {
		return nil, err
	}
	return gen.SearchUsers200JSONResponse(a.toUserPage(items, more)), nil
}

func (a *apiServer) ListFollowers(ctx context.Context, req gen.ListFollowersRequestObject) (gen.ListFollowersResponseObject, error) {
	limit, after, err := pageParams(req.Params.Limit, req.Params.Cursor)
	if err != nil {
		return nil, err
	}
	items, more, err := a.users.Followers(ctx, string(req.Username), after, limit)
	if errors.Is(err, store.ErrNotFound) {
		return gen.ListFollowers404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("usuário não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.ListFollowers200JSONResponse(a.toUserPage(items, more)), nil
}

func (a *apiServer) ListFollowing(ctx context.Context, req gen.ListFollowingRequestObject) (gen.ListFollowingResponseObject, error) {
	limit, after, err := pageParams(req.Params.Limit, req.Params.Cursor)
	if err != nil {
		return nil, err
	}
	items, more, err := a.users.Following(ctx, string(req.Username), after, limit)
	if errors.Is(err, store.ErrNotFound) {
		return gen.ListFollowing404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("usuário não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.ListFollowing200JSONResponse(a.toUserPage(items, more)), nil
}
