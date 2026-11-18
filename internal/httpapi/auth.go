package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/golden-era/api/internal/api/gen"
	"github.com/golden-era/api/internal/auth"
	"github.com/golden-era/api/internal/store"
)

// UserStore é o que os handlers precisam de contas e sessões.
type UserStore interface {
	Create(ctx context.Context, email, username, passwordHash string) (store.User, error)
	ByEmail(ctx context.Context, email string) (store.User, error)
	Profile(ctx context.Context, id string) (store.Profile, error)
	PublicProfile(ctx context.Context, username, viewerID string) (store.Profile, error)
	UpdateProfile(ctx context.Context, id string, up store.ProfileUpdate) error
	Search(ctx context.Context, q, after string, limit int) ([]store.DeckOwner, bool, error)
	Followers(ctx context.Context, username, after string, limit int) ([]store.DeckOwner, bool, error)
	Following(ctx context.Context, username, after string, limit int) ([]store.DeckOwner, bool, error)
	SaveRefreshToken(ctx context.Context, userID string, hash []byte, expiresAt time.Time) error
	ConsumeRefreshToken(ctx context.Context, hash []byte) (string, error)
	RevokeRefreshToken(ctx context.Context, userID string, hash []byte) error
}

var usernameRE = regexp.MustCompile(`^[A-Za-z0-9_]{3,24}$`)

// ---- autenticação nas rotas -------------------------------------------------

type ctxKey int

const userIDKey ctxKey = 0

// userID devolve o id do usuário autenticado pela requisição (vazio se anônima).
func userID(ctx context.Context) string {
	id, _ := ctx.Value(userIDKey).(string)
	return id
}

// publicOps são as operações que NÃO exigem token. Todas as demais exigem (nega por padrão),
// então uma operação nova nasce protegida mesmo que alguém esqueça de listá-la.
var publicOps = map[string]bool{
	"GetHealth":      true,
	"ListCards":      true,
	"GetCard":        true,
	"ListArchetypes": true,
	"ListSets":       true,
	"GetBanlist":     true,
	"ListAnimeDecks": true,
	"GetCardFacets":  true,
	"SearchUsers":    true,
	"ListFollowers":  true,
	"ListFollowing":  true,
	"Register":       true,
	"Login":          true,
	"RefreshToken":   true,

	"ListDeckComments": true,
}

// optionalAuthOps aceitam visitantes anônimos, mas, se vier um token, ele precisa ser válido
// (o usuário identificado vê, por exemplo, os próprios decks privados e likedByMe).
var optionalAuthOps = map[string]bool{
	"GetDeck":       true,
	"ExportDeck":    true,
	"ListDecks":     true,
	"ListUserDecks": true,
	"GetUser":       true,
}

type unauthorizedError struct{ msg string }

func (e unauthorizedError) Error() string { return e.msg }

// authenticate valida o bearer token das operações protegidas e põe o id do usuário no contexto.
func (a *apiServer) authenticate(next gen.StrictHandlerFunc, operationID string) gen.StrictHandlerFunc {
	if publicOps[operationID] {
		return next
	}
	optional := optionalAuthOps[operationID]
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request, req any) (any, error) {
		header := r.Header.Get("Authorization")
		if optional && header == "" {
			return next(ctx, w, r, req)
		}
		raw, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || raw == "" {
			return nil, unauthorizedError{"token de acesso ausente"}
		}
		id, err := a.tokens.ParseAccessToken(raw)
		if err != nil {
			return nil, unauthorizedError{"token de acesso inválido ou expirado"}
		}
		return next(context.WithValue(ctx, userIDKey, id), w, r, req)
	}
}

// ---- cadastro e sessão ------------------------------------------------------

func (a *apiServer) Register(ctx context.Context, req gen.RegisterRequestObject) (gen.RegisterResponseObject, error) {
	b := req.Body
	if b == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	if wait, ok := a.registers.allow(clientIPFrom(ctx)); !ok {
		retryAfter := int(wait.Seconds()) + 1
		return gen.Register429ApplicationProblemPlusJSONResponse{
			TooManyRequestsApplicationProblemPlusJSONResponse: gen.TooManyRequestsApplicationProblemPlusJSONResponse{
				Body:    newProblem(http.StatusTooManyRequests, "muitos cadastros deste endereço; tente de novo mais tarde"),
				Headers: gen.TooManyRequestsResponseHeaders{RetryAfter: &retryAfter},
			},
		}, nil
	}
	email := strings.TrimSpace(string(b.Email))
	var errs []fieldError
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email || len(email) > 254 {
		errs = append(errs, fieldError{"email", "e-mail inválido"})
	}
	if !usernameRE.MatchString(b.Username) {
		errs = append(errs, fieldError{"username", "use de 3 a 24 caracteres: letras, números e _"})
	}
	if n := len(b.Password); n < 8 || n > 72 {
		errs = append(errs, fieldError{"password", "a senha deve ter entre 8 e 72 bytes"})
	}
	if len(errs) > 0 {
		return gen.Register422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("dados inválidos", errs),
		}, nil
	}

	hash, err := auth.HashPassword(b.Password)
	if err != nil {
		return nil, err
	}
	u, err := a.users.Create(ctx, email, b.Username, hash)
	if errors.Is(err, store.ErrConflict) {
		return gen.Register409ApplicationProblemPlusJSONResponse{
			ConflictApplicationProblemPlusJSONResponse: gen.ConflictApplicationProblemPlusJSONResponse(
				newProblem(http.StatusConflict, "e-mail ou username já cadastrado")),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	tokens, err := a.issueTokens(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	return gen.Register201JSONResponse(tokens), nil
}

var (
	dummyHashOnce sync.Once
	dummyHash     string
)

func (a *apiServer) Login(ctx context.Context, req gen.LoginRequestObject) (gen.LoginResponseObject, error) {
	b := req.Body
	if b == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	invalid := gen.Login401ApplicationProblemPlusJSONResponse{
		UnauthorizedApplicationProblemPlusJSONResponse: gen.UnauthorizedApplicationProblemPlusJSONResponse(
			newProblem(http.StatusUnauthorized, "e-mail ou senha incorretos")),
	}

	email := strings.TrimSpace(string(b.Email))
	key := strings.ToLower(email)
	// Bloqueado antes de tocar no banco ou no bcrypt: tentar de novo não custa nada ao servidor.
	if wait, blocked := a.logins.blocked(key); blocked {
		retryAfter := int(wait.Seconds()) + 1 // arredonda para cima: nunca promete antes da hora
		return gen.Login429ApplicationProblemPlusJSONResponse{
			TooManyRequestsApplicationProblemPlusJSONResponse: gen.TooManyRequestsApplicationProblemPlusJSONResponse{
				Body:    newProblem(http.StatusTooManyRequests, "muitas tentativas de login; tente de novo mais tarde"),
				Headers: gen.TooManyRequestsResponseHeaders{RetryAfter: &retryAfter},
			},
		}, nil
	}

	u, err := a.users.ByEmail(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		// Gasta o mesmo tempo de uma conta real para não revelar se o e-mail existe.
		dummyHashOnce.Do(func() { dummyHash, _ = auth.HashPassword("dummy-password") })
		auth.CheckPassword(dummyHash, b.Password)
		a.logins.fail(key) // também conta para e-mails inexistentes: o comportamento não revela quem tem conta
		return invalid, nil
	}
	if err != nil {
		return nil, err
	}
	if !auth.CheckPassword(u.PasswordHash, b.Password) {
		a.logins.fail(key)
		return invalid, nil
	}
	a.logins.reset(key)
	tokens, err := a.issueTokens(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	return gen.Login200JSONResponse(tokens), nil
}

func (a *apiServer) RefreshToken(ctx context.Context, req gen.RefreshTokenRequestObject) (gen.RefreshTokenResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	// O refresh token é de uso único: consumi-lo e emitir outro par é a rotação.
	id, err := a.users.ConsumeRefreshToken(ctx, auth.HashRefreshToken(req.Body.RefreshToken))
	if errors.Is(err, store.ErrNotFound) {
		return gen.RefreshToken401ApplicationProblemPlusJSONResponse{
			UnauthorizedApplicationProblemPlusJSONResponse: gen.UnauthorizedApplicationProblemPlusJSONResponse(
				newProblem(http.StatusUnauthorized, "refresh token inválido, expirado ou já usado")),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	tokens, err := a.issueTokens(ctx, id)
	if err != nil {
		return nil, err
	}
	return gen.RefreshToken200JSONResponse(tokens), nil
}

func (a *apiServer) Logout(ctx context.Context, req gen.LogoutRequestObject) (gen.LogoutResponseObject, error) {
	if req.Body == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	if err := a.users.RevokeRefreshToken(ctx, userID(ctx), auth.HashRefreshToken(req.Body.RefreshToken)); err != nil {
		return nil, err
	}
	return gen.Logout204Response{}, nil
}

func (a *apiServer) issueTokens(ctx context.Context, id string) (gen.AuthTokens, error) {
	access, err := a.tokens.NewAccessToken(id)
	if err != nil {
		return gen.AuthTokens{}, err
	}
	refresh, hash, expires, err := a.tokens.NewRefreshToken()
	if err != nil {
		return gen.AuthTokens{}, err
	}
	if err := a.users.SaveRefreshToken(ctx, id, hash, expires); err != nil {
		return gen.AuthTokens{}, err
	}
	return gen.AuthTokens{AccessToken: access, RefreshToken: refresh, ExpiresIn: int(a.tokens.AccessTTL.Seconds())}, nil
}

// ---- perfil -----------------------------------------------------------------

func (a *apiServer) GetMe(ctx context.Context, _ gen.GetMeRequestObject) (gen.GetMeResponseObject, error) {
	p, err := a.users.Profile(ctx, userID(ctx))
	if errors.Is(err, store.ErrNotFound) { // conta apagada com token ainda válido
		return gen.GetMe401ApplicationProblemPlusJSONResponse{
			UnauthorizedApplicationProblemPlusJSONResponse: gen.UnauthorizedApplicationProblemPlusJSONResponse(
				newProblem(http.StatusUnauthorized, "conta não encontrada")),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return gen.GetMe200JSONResponse(a.toAPIProfile(p)), nil
}

func (a *apiServer) UpdateMe(ctx context.Context, req gen.UpdateMeRequestObject) (gen.UpdateMeResponseObject, error) {
	b := req.Body
	if b == nil {
		return nil, badRequest("corpo da requisição ausente")
	}
	var (
		errs []fieldError
		up   store.ProfileUpdate
	)
	if b.Bio != nil {
		if len([]rune(*b.Bio)) > 280 {
			errs = append(errs, fieldError{"bio", "a bio deve ter no máximo 280 caracteres"})
		}
		up.Bio = b.Bio
	}
	if b.AvatarCardId != nil {
		switch {
		case *b.AvatarCardId < 0:
			errs = append(errs, fieldError{"avatarCardId", "informe o id de uma carta (ou 0 para remover a foto)"})
		case *b.AvatarCardId == 0:
			up.ClearAvatar = true // 0 remove a foto de perfil
		default:
			up.AvatarCardID = b.AvatarCardId
		}
	}
	if len(errs) > 0 {
		return gen.UpdateMe422ApplicationProblemPlusJSONResponse{
			ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("dados inválidos", errs),
		}, nil
	}

	id := userID(ctx)
	if err := a.users.UpdateProfile(ctx, id, up); err != nil {
		if errors.Is(err, store.ErrInvalidCard) {
			return gen.UpdateMe422ApplicationProblemPlusJSONResponse{
				ValidationErrorApplicationProblemPlusJSONResponse: validationProblem("dados inválidos",
					[]fieldError{{"avatarCardId", "carta não encontrada no catálogo"}}),
			}, nil
		}
		if errors.Is(err, store.ErrNotFound) {
			return gen.UpdateMe401ApplicationProblemPlusJSONResponse{
				UnauthorizedApplicationProblemPlusJSONResponse: gen.UnauthorizedApplicationProblemPlusJSONResponse(
					newProblem(http.StatusUnauthorized, "conta não encontrada")),
			}, nil
		}
		return nil, err
	}
	p, err := a.users.Profile(ctx, id)
	if err != nil {
		return nil, err
	}
	return gen.UpdateMe200JSONResponse(a.toAPIProfile(p)), nil
}

// avatarURL monta a URL da imagem da carta da foto de perfil; nulo sem foto.
func (a *apiServer) avatarURL(path *string) *string {
	if path == nil {
		return nil
	}
	u := a.imageBaseURL + "/" + *path
	return &u
}

// userSummary converte o dono/autor para o contrato, com a carta da foto de perfil.
func (a *apiServer) userSummary(o store.DeckOwner) gen.UserSummary {
	return gen.UserSummary{Id: uuid.MustParse(o.ID), Username: o.Username, AvatarCardId: o.AvatarCardID, AvatarUrl: a.avatarURL(o.AvatarPath)}
}

func (a *apiServer) toAPIProfile(p store.Profile) gen.Profile {
	created := p.CreatedAt
	return gen.Profile{
		Id:             uuid.MustParse(p.ID),
		Username:       p.Username,
		AvatarCardId:   p.AvatarCardID,
		AvatarUrl:      a.avatarURL(p.AvatarPath),
		Bio:            &p.Bio,
		DeckCount:      &p.DeckCount,
		FollowerCount:  &p.FollowerCount,
		FollowingCount: &p.FollowingCount,
		CreatedAt:      &created,
	}
}

// ---- erros de validação (422) -----------------------------------------------

type fieldError struct{ field, message string }

func validationProblem(detail string, errs []fieldError) gen.ValidationErrorApplicationProblemPlusJSONResponse {
	base := newProblem(http.StatusUnprocessableEntity, detail)
	list := make([]struct {
		Field   string `json:"field"`
		Message string `json:"message"`
	}, len(errs))
	for i, e := range errs {
		list[i].Field, list[i].Message = e.field, e.message
	}
	return gen.ValidationErrorApplicationProblemPlusJSONResponse{
		Type: base.Type, Title: base.Title, Status: base.Status, Detail: base.Detail, Errors: &list,
	}
}
