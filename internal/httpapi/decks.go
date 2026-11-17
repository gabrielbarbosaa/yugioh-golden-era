package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/deck"
	"github.com/golden-era/api/internal/store"
)

// maxEntriesPerZone barra payloads absurdos antes de consultar o banco.
const maxEntriesPerZone = 100

// DeckStore é o que os handlers precisam dos decks.
type DeckStore interface {
	Create(ctx context.Context, ownerID string, in store.DeckInput) (string, error)
	Replace(ctx context.Context, id, ownerID string, in store.DeckInput) error
	Delete(ctx context.Context, id, ownerID string) error
	Get(ctx context.Context, id, viewerID string) (store.Deck, error)
	List(ctx context.Context, f store.DeckFilter, after *store.DeckCursor, limit int) ([]store.DeckSummary, bool, error)
	Copy(ctx context.Context, srcID, userID string) (string, error)
	UserExists(ctx context.Context, username string) (bool, error)
}

// ---- helpers de resposta ----------------------------------------------------

func notFoundProblem(msg string) gen.NotFoundApplicationProblemPlusJSONResponse {
	return gen.NotFoundApplicationProblemPlusJSONResponse(newProblem(http.StatusNotFound, msg))
}

func forbiddenProblem(msg string) gen.ForbiddenApplicationProblemPlusJSONResponse {
	return gen.ForbiddenApplicationProblemPlusJSONResponse(newProblem(http.StatusForbidden, msg))
}

func issuesToFields(is []deck.Issue) []fieldError {
	out := make([]fieldError, len(is))
	for i, x := range is {
		out[i] = fieldError{x.Field, x.Message}
	}
	return out
}

// ---- validação do corpo -----------------------------------------------------

func toDeckCards(c gen.DeckCards) deck.Cards {
	conv := func(in []gen.DeckCardEntry) []deck.Entry {
		out := make([]deck.Entry, len(in))
		for i, e := range in {
			out[i] = deck.Entry{CardID: e.CardId, Quantity: e.Quantity}
		}
		return out
	}
	return deck.Cards{Main: conv(c.Main), Extra: conv(c.Extra), Side: conv(c.Side)}
}

// prepareDeck valida o conteúdo e monta o que será gravado. Devolve os erros de campo (422), se houver.
func (a *apiServer) prepareDeck(ctx context.Context, in gen.DeckInput) (store.DeckInput, []fieldError, error) {
	var errs []fieldError

	name := strings.TrimSpace(in.Name)
	if n := len([]rune(name)); n < 1 || n > deck.MaxNameLen {
		errs = append(errs, fieldError{"name", "o nome deve ter de 1 a 80 caracteres"})
	}
	desc := ""
	if in.Description != nil {
		desc = *in.Description
	}
	if len([]rune(desc)) > deck.MaxDescLen {
		errs = append(errs, fieldError{"description", "a descrição deve ter no máximo 2000 caracteres"})
	}
	var arch *string
	if in.Archetype != nil {
		if s := strings.TrimSpace(*in.Archetype); s != "" {
			if len([]rune(s)) > deck.MaxArchLen {
				errs = append(errs, fieldError{"archetype", "o arquétipo deve ter no máximo 100 caracteres"})
			}
			arch = &s
		}
	}
	if in.Visibility != "private" && in.Visibility != "public" {
		errs = append(errs, fieldError{"visibility", "use private ou public"})
	}

	cards := toDeckCards(in.Cards)
	for zone, es := range map[string][]deck.Entry{"main": cards.Main, "extra": cards.Extra, "side": cards.Side} {
		if len(es) > maxEntriesPerZone {
			errs = append(errs, fieldError{"cards." + zone, "cartas demais nesta zona"})
		}
	}
	if len(errs) > 0 {
		return store.DeckInput{}, errs, nil
	}

	infos, err := a.cards.Infos(ctx, cards.IDs())
	if err != nil {
		return store.DeckInput{}, nil, err
	}
	if issues := deck.Validate(cards, infos, in.Visibility == "public"); len(issues) > 0 {
		return store.DeckInput{}, issuesToFields(issues), nil
	}
	return store.DeckInput{
		Name:        name,
		Description: desc,
		Archetype:   arch,
		Visibility:  string(in.Visibility),
		CoverCardID: deck.Cover(cards),
		Cards:       cards,
	}, nil, nil
}

// ---- conversão para o contrato ----------------------------------------------

// coverURL monta a URL da imagem da capa; nulo quando o deck não tem capa.
func (a *apiServer) coverURL(s store.DeckSummary) *string {
	if s.CoverImagePath == nil {
		return nil
	}
	u := a.imageBaseURL + "/" + *s.CoverImagePath
	return &u
}

func (a *apiServer) toAPISummary(s store.DeckSummary) gen.DeckSummary {
	liked := s.LikedByMe
	return gen.DeckSummary{
		Id:            uuid.MustParse(s.ID),
		Name:          s.Name,
		Archetype:     s.Archetype,
		Visibility:    gen.DeckVisibility(s.Visibility),
		CoverCardId:   s.CoverCardID,
		CoverImageUrl: a.coverURL(s),
		LikeCount:     s.LikeCount,
		CommentCount:  s.CommentCount,
		LikedByMe:     &liked,
		CreatedAt:     s.CreatedAt,
		UpdatedAt:     s.UpdatedAt,
		Owner: gen.UserSummary{
			Id:        uuid.MustParse(s.Owner.ID),
			Username:  s.Owner.Username,
			AvatarUrl: s.Owner.AvatarURL,
		},
	}
}

func (a *apiServer) toAPIDeck(d store.Deck) gen.Deck {
	s := a.toAPISummary(d.DeckSummary)
	st := deck.ComputeStats(d.Cards, d.Infos)
	conv := func(es []deck.Entry) []gen.DeckCardEntry {
		out := make([]gen.DeckCardEntry, len(es))
		for i, e := range es {
			out[i] = gen.DeckCardEntry{CardId: e.CardID, Quantity: e.Quantity}
		}
		return out
	}
	return gen.Deck{
		Id: s.Id, Name: s.Name, Archetype: s.Archetype, Visibility: s.Visibility, CoverCardId: s.CoverCardId, CoverImageUrl: s.CoverImageUrl,
		LikeCount: s.LikeCount, CommentCount: s.CommentCount, LikedByMe: s.LikedByMe,
		CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt, Owner: s.Owner,
		Description: d.Description,
		Cards:       gen.DeckCards{Main: conv(d.Cards.Main), Extra: conv(d.Cards.Extra), Side: conv(d.Cards.Side)},
		Stats:       gen.DeckStats{Monsters: &st.Monsters, Spells: &st.Spells, Traps: &st.Traps, AverageLevel: st.AverageLevel},
	}
}

// ---- CRUD -------------------------------------------------------------------

func (a *apiServer) CreateDeck(ctx context.Context, req gen.CreateDeckRequestObject) (gen.CreateDeckResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	in, errs, err := a.prepareDeck(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	if len(errs) > 0 {
		return gen.CreateDeck422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("deck fora das regras", errs)}, nil
	}
	me := userID(ctx)
	id, err := a.decks.Create(ctx, me, in)
	if err != nil {
		return nil, err
	}
	d, err := a.decks.Get(ctx, id, me)
	if err != nil {
		return nil, err
	}
	return gen.CreateDeck201JSONResponse(a.toAPIDeck(d)), nil
}

func (a *apiServer) UpdateDeck(ctx context.Context, req gen.UpdateDeckRequestObject) (gen.UpdateDeckResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	me, id := userID(ctx), req.DeckId.String()

	// Confere existência e dono antes de validar o corpo: quem não pode editar não precisa de 422.
	cur, err := a.decks.Get(ctx, id, me)
	if errors.Is(err, store.ErrNotFound) {
		return gen.UpdateDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	if cur.Owner.ID != me {
		return gen.UpdateDeck403ApplicationProblemPlusJSONResponse{ForbiddenApplicationProblemPlusJSONResponse: forbiddenProblem("apenas o dono pode editar o deck")}, nil
	}

	in, errs, err := a.prepareDeck(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	if len(errs) > 0 {
		return gen.UpdateDeck422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("deck fora das regras", errs)}, nil
	}
	switch err := a.decks.Replace(ctx, id, me, in); {
	case errors.Is(err, store.ErrNotFound):
		return gen.UpdateDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck não encontrado")}, nil
	case errors.Is(err, store.ErrForbidden):
		return gen.UpdateDeck403ApplicationProblemPlusJSONResponse{ForbiddenApplicationProblemPlusJSONResponse: forbiddenProblem("apenas o dono pode editar o deck")}, nil
	case err != nil:
		return nil, err
	}
	d, err := a.decks.Get(ctx, id, me)
	if err != nil {
		return nil, err
	}
	return gen.UpdateDeck200JSONResponse(a.toAPIDeck(d)), nil
}

func (a *apiServer) DeleteDeck(ctx context.Context, req gen.DeleteDeckRequestObject) (gen.DeleteDeckResponseObject, error) {
	me, id := userID(ctx), req.DeckId.String()
	notFound := gen.DeleteDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck não encontrado")}
	forbidden := gen.DeleteDeck403ApplicationProblemPlusJSONResponse{ForbiddenApplicationProblemPlusJSONResponse: forbiddenProblem("apenas o dono pode remover o deck")}

	// Get já esconde decks privados de terceiros (404); só então distinguimos dono de não dono (403).
	cur, err := a.decks.Get(ctx, id, me)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	if cur.Owner.ID != me {
		return forbidden, nil
	}
	switch err := a.decks.Delete(ctx, id, me); {
	case errors.Is(err, store.ErrNotFound):
		return notFound, nil
	case errors.Is(err, store.ErrForbidden):
		return forbidden, nil
	case err != nil:
		return nil, err
	}
	return gen.DeleteDeck204Response{}, nil
}

func (a *apiServer) GetDeck(ctx context.Context, req gen.GetDeckRequestObject) (gen.GetDeckResponseObject, error) {
	d, err := a.decks.Get(ctx, req.DeckId.String(), userID(ctx))
	if errors.Is(err, store.ErrNotFound) {
		return gen.GetDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.GetDeck200JSONResponse(a.toAPIDeck(d)), nil
}

func (a *apiServer) CopyDeck(ctx context.Context, req gen.CopyDeckRequestObject) (gen.CopyDeckResponseObject, error) {
	me := userID(ctx)
	id, err := a.decks.Copy(ctx, req.DeckId.String(), me)
	if errors.Is(err, store.ErrNotFound) {
		return gen.CopyDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	d, err := a.decks.Get(ctx, id, me)
	if err != nil {
		return nil, err
	}
	return gen.CopyDeck201JSONResponse(a.toAPIDeck(d)), nil
}

// ---- YDK --------------------------------------------------------------------

func (a *apiServer) ExportDeck(ctx context.Context, req gen.ExportDeckRequestObject) (gen.ExportDeckResponseObject, error) {
	d, err := a.decks.Get(ctx, req.DeckId.String(), userID(ctx))
	if errors.Is(err, store.ErrNotFound) {
		return gen.ExportDeck404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("deck não encontrado")}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.ExportDeck200TextResponse(deck.FormatYDK(d.Cards, d.Owner.Username+" (Golden Era)")), nil
}

func (a *apiServer) ImportDeck(ctx context.Context, req gen.ImportDeckRequestObject) (gen.ImportDeckResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	unprocessable := func(errs []fieldError) gen.ImportDeckResponseObject {
		return gen.ImportDeck422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("arquivo YDK inválido", errs)}
	}

	cards, issues := deck.ParseYDK(*req.Body)
	if len(issues) > 0 {
		return unprocessable(issuesToFields(issues)), nil
	}
	in := gen.DeckInput{
		Name:       "Deck importado",
		Visibility: "private", // importado como rascunho; o dono publica depois de revisar
		Cards:      fromDeckCards(cards),
	}
	prepared, errs, err := a.prepareDeck(ctx, in)
	if err != nil {
		return nil, err
	}
	if len(errs) > 0 {
		return unprocessable(errs), nil
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
	return gen.ImportDeck201JSONResponse(a.toAPIDeck(d)), nil
}

func fromDeckCards(c deck.Cards) gen.DeckCards {
	conv := func(es []deck.Entry) []gen.DeckCardEntry {
		out := make([]gen.DeckCardEntry, len(es))
		for i, e := range es {
			out[i] = gen.DeckCardEntry{CardId: e.CardID, Quantity: e.Quantity}
		}
		return out
	}
	return gen.DeckCards{Main: conv(c.Main), Extra: conv(c.Extra), Side: conv(c.Side)}
}

// ---- listagens --------------------------------------------------------------

func (a *apiServer) listDeckPage(ctx context.Context, f store.DeckFilter, cursor *string, limit *int) (gen.DeckPage, error) {
	n := defaultLimit
	if limit != nil {
		n = *limit
	}
	if n < 1 || n > maxLimit {
		return gen.DeckPage{}, badRequest("limit deve estar entre 1 e 100")
	}
	var after *store.DeckCursor
	if cursor != nil && *cursor != "" {
		c, err := decodeDeckCursor(*cursor)
		if err != nil {
			return gen.DeckPage{}, badRequest("cursor inválido")
		}
		after = &c
	}
	f.ViewerID = userID(ctx)

	items, more, err := a.decks.List(ctx, f, after, n)
	if err != nil {
		return gen.DeckPage{}, err
	}
	page := gen.DeckPage{Items: make([]gen.DeckSummary, 0, len(items))}
	for _, s := range items {
		page.Items = append(page.Items, a.toAPISummary(s))
	}
	if more {
		last := items[len(items)-1]
		cur := store.DeckCursor{ID: last.ID}
		switch f.Sort {
		case store.SortRecent:
			cur.Time = last.CreatedAt
		case store.SortUpdated:
			cur.Time = last.UpdatedAt
		default:
			cur.Likes = last.LikeCount
		}
		next := encodeDeckCursor(cur)
		page.NextCursor = &next
	}
	return page, nil
}

func (a *apiServer) ListDecks(ctx context.Context, req gen.ListDecksRequestObject) (gen.ListDecksResponseObject, error) {
	p := req.Params
	f := store.DeckFilter{Sort: store.SortPopular, PublicOnly: true, Archetype: nonEmpty(p.Archetype)}
	if p.Sort != nil {
		switch *p.Sort {
		case "popular":
		case "recent":
			f.Sort = store.SortRecent
		default:
			return nil, badRequest("sort deve ser popular ou recent")
		}
	}
	if p.Q != nil {
		if len([]rune(*p.Q)) > 100 {
			return nil, badRequest("q deve ter no máximo 100 caracteres")
		}
		f.Query = *p.Q
	}
	page, err := a.listDeckPage(ctx, f, p.Cursor, p.Limit)
	if err != nil {
		return nil, err
	}
	return gen.ListDecks200JSONResponse(page), nil
}

func (a *apiServer) ListMyDecks(ctx context.Context, req gen.ListMyDecksRequestObject) (gen.ListMyDecksResponseObject, error) {
	me := userID(ctx)
	page, err := a.listDeckPage(ctx, store.DeckFilter{Sort: store.SortUpdated, OwnerID: &me}, req.Params.Cursor, req.Params.Limit)
	if err != nil {
		return nil, err
	}
	return gen.ListMyDecks200JSONResponse(page), nil
}

func (a *apiServer) ListUserDecks(ctx context.Context, req gen.ListUserDecksRequestObject) (gen.ListUserDecksResponseObject, error) {
	ok, err := a.decks.UserExists(ctx, req.Username)
	if err != nil {
		return nil, err
	}
	if !ok {
		return gen.ListUserDecks404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("usuário não encontrado")}, nil
	}
	username := req.Username
	page, err := a.listDeckPage(ctx, store.DeckFilter{Sort: store.SortRecent, OwnerUsername: &username, PublicOnly: true}, req.Params.Cursor, req.Params.Limit)
	if err != nil {
		return nil, err
	}
	return gen.ListUserDecks200JSONResponse(page), nil
}

func encodeDeckCursor(c store.DeckCursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeDeckCursor(s string) (store.DeckCursor, error) {
	var c store.DeckCursor
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return c, err
	}
	if _, err := uuid.Parse(c.ID); err != nil {
		return c, err
	}
	return c, nil
}
