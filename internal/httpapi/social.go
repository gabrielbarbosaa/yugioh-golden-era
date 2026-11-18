package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/store"
)

const maxCommentLen = 1000

// SocialStore é o que os handlers precisam de curtidas, comentários e seguidores.
type SocialStore interface {
	Like(ctx context.Context, deckID, userID string) error
	Unlike(ctx context.Context, deckID, userID string) error
	ListComments(ctx context.Context, deckID string, after *store.CommentCursor, limit int) ([]store.Comment, bool, error)
	CreateComment(ctx context.Context, deckID, authorID, body string) (store.Comment, error)
	Follow(ctx context.Context, followerID, username string) error
	Unfollow(ctx context.Context, followerID, username string) error
}

// ---- curtidas ---------------------------------------------------------------

func (a *apiServer) LikeDeck(ctx context.Context, req gen.LikeDeckRequestObject) (gen.LikeDeckResponseObject, error) {
	err := a.social.Like(ctx, req.DeckId.String(), userID(ctx))
	if errors.Is(err, store.ErrNotFound) {
		return gen.LikeDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck público não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.LikeDeck204Response{}, nil
}

func (a *apiServer) UnlikeDeck(ctx context.Context, req gen.UnlikeDeckRequestObject) (gen.UnlikeDeckResponseObject, error) {
	if err := a.social.Unlike(ctx, req.DeckId.String(), userID(ctx)); err != nil {
		return nil, err
	}
	return gen.UnlikeDeck204Response{}, nil
}

// ---- comentários ------------------------------------------------------------

func (a *apiServer) toAPIComment(c store.Comment) gen.Comment {
	return gen.Comment{
		Id:        uuid.MustParse(c.ID),
		Body:      c.Body,
		CreatedAt: c.CreatedAt,
		Author:    a.userSummary(c.Author),
	}
}

func (a *apiServer) ListDeckComments(ctx context.Context, req gen.ListDeckCommentsRequestObject) (gen.ListDeckCommentsResponseObject, error) {
	limit := defaultLimit
	if req.Params.Limit != nil {
		limit = *req.Params.Limit
	}
	if limit < 1 || limit > maxLimit {
		return nil, badRequest("limit deve estar entre 1 e 100")
	}
	var after *store.CommentCursor
	if c := req.Params.Cursor; c != nil && *c != "" {
		cur, err := decodeCommentCursor(*c)
		if err != nil {
			return nil, badRequest("cursor inválido")
		}
		after = &cur
	}

	items, more, err := a.social.ListComments(ctx, req.DeckId.String(), after, limit)
	if errors.Is(err, store.ErrNotFound) {
		return gen.ListDeckComments404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck público não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	page := gen.CommentPage{Items: make([]gen.Comment, 0, len(items))}
	for _, c := range items {
		page.Items = append(page.Items, a.toAPIComment(c))
	}
	if more {
		last := items[len(items)-1]
		b, _ := json.Marshal(store.CommentCursor{Time: last.CreatedAt, ID: last.ID})
		next := base64.RawURLEncoding.EncodeToString(b)
		page.NextCursor = &next
	}
	return gen.ListDeckComments200JSONResponse(page), nil
}

func (a *apiServer) CreateDeckComment(ctx context.Context, req gen.CreateDeckCommentRequestObject) (gen.CreateDeckCommentResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	body := strings.TrimSpace(req.Body.Body)
	if n := len([]rune(body)); n < 1 || n > maxCommentLen {
		return gen.CreateDeckComment422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("comentário inválido",
				[]fieldError{{"body", "o comentário deve ter de 1 a 1000 caracteres"}})}, nil
	}
	c, err := a.social.CreateComment(ctx, req.DeckId.String(), userID(ctx), body)
	if errors.Is(err, store.ErrNotFound) {
		return gen.CreateDeckComment404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck público não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.CreateDeckComment201JSONResponse(a.toAPIComment(c)), nil
}

func decodeCommentCursor(s string) (store.CommentCursor, error) {
	var c store.CommentCursor
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return c, err
	}
	_, err = uuid.Parse(c.ID)
	return c, err
}

// ---- seguidores e perfil público --------------------------------------------

func (a *apiServer) FollowUser(ctx context.Context, req gen.FollowUserRequestObject) (gen.FollowUserResponseObject, error) {
	switch err := a.social.Follow(ctx, userID(ctx), req.Username); {
	case errors.Is(err, store.ErrNotFound):
		return gen.FollowUser404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("usuário não encontrado")}, nil
	case errors.Is(err, store.ErrSelfFollow):
		return nil, badRequest(err.Error())
	case err != nil:
		return nil, err
	}
	return gen.FollowUser204Response{}, nil
}

func (a *apiServer) UnfollowUser(ctx context.Context, req gen.UnfollowUserRequestObject) (gen.UnfollowUserResponseObject, error) {
	if err := a.social.Unfollow(ctx, userID(ctx), req.Username); err != nil {
		return nil, err
	}
	return gen.UnfollowUser204Response{}, nil
}

func (a *apiServer) GetUser(ctx context.Context, req gen.GetUserRequestObject) (gen.GetUserResponseObject, error) {
	p, err := a.users.PublicProfile(ctx, req.Username, userID(ctx))
	if errors.Is(err, store.ErrNotFound) {
		return gen.GetUser404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("usuário não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	out := a.toAPIProfile(p)
	out.FollowedByMe = &p.FollowedByMe
	return gen.GetUser200JSONResponse(out), nil
}
