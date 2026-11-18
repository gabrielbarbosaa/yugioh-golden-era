package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/golden-era/api/internal/auth"
	"github.com/golden-era/api/internal/store"
)

// fakeUsers implementa UserStore em memória.
type fakeUsers struct {
	mu      sync.Mutex
	users   map[string]store.User // por id
	tokens  map[string]string     // hash do refresh token -> user id (vazio = revogado)
	profile store.ProfileUpdate
	follows [][2]string // {seguidor, seguido}
}

func newFakeUsers() *fakeUsers {
	return &fakeUsers{users: map[string]store.User{}, tokens: map[string]string{}}
}

func (f *fakeUsers) Create(_ context.Context, email, username, hash string) (store.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.users {
		if strings.EqualFold(u.Email, email) || strings.EqualFold(u.Username, username) {
			return store.User{}, store.ErrConflict
		}
	}
	u := store.User{ID: uuid.NewString(), Email: email, Username: username, PasswordHash: hash, CreatedAt: time.Now()}
	f.users[u.ID] = u
	return u, nil
}

func (f *fakeUsers) ByEmail(_ context.Context, email string) (store.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.users {
		if strings.EqualFold(u.Email, email) {
			return u, nil
		}
	}
	return store.User{}, store.ErrNotFound
}

func (f *fakeUsers) Profile(_ context.Context, id string) (store.Profile, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[id]
	if !ok {
		return store.Profile{}, store.ErrNotFound
	}
	return store.Profile{User: u}, nil
}

func (f *fakeUsers) PublicProfile(_ context.Context, username, viewerID string) (store.Profile, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.users {
		if u.Username == username {
			p := store.Profile{User: u}
			for _, fo := range f.follows {
				if fo[1] == u.ID {
					p.FollowerCount++
					if fo[0] == viewerID {
						p.FollowedByMe = true
					}
				}
			}
			return p, nil
		}
	}
	return store.Profile{}, store.ErrNotFound
}

func (f *fakeUsers) UpdateProfile(_ context.Context, id string, up store.ProfileUpdate) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[id]
	if !ok {
		return store.ErrNotFound
	}
	if up.Bio != nil {
		u.Bio = *up.Bio
	}
	switch {
	case up.ClearAvatar:
		u.AvatarCardID, u.AvatarPath = nil, nil
	case up.AvatarCardID != nil:
		if *up.AvatarCardID > 1000 { // no teste, só ids até 1000 "existem" no catálogo
			return store.ErrInvalidCard
		}
		path := fmt.Sprintf("cards_small/%d.jpg", *up.AvatarCardID)
		u.AvatarCardID, u.AvatarPath = up.AvatarCardID, &path
	}
	f.users[id] = u
	return nil
}

func (f *fakeUsers) SaveRefreshToken(_ context.Context, userID string, hash []byte, _ time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tokens[string(hash)] = userID
	return nil
}

func (f *fakeUsers) ConsumeRefreshToken(_ context.Context, hash []byte) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := f.tokens[string(hash)]
	if id == "" {
		return "", store.ErrNotFound
	}
	f.tokens[string(hash)] = ""
	return id, nil
}

func (f *fakeUsers) RevokeRefreshToken(_ context.Context, userID string, hash []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.tokens[string(hash)] == userID {
		f.tokens[string(hash)] = ""
	}
	return nil
}

func newAuthServer(t *testing.T) *httptest.Server {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(NewHandler(log, "test", Deps{
		Cards:        &fakeCards{},
		Users:        newFakeUsers(),
		Tokens:       auth.NewTokens("test-secret-test-secret-test-secret-12", time.Minute, time.Hour),
		ImageBaseURL: "http://img",
	}))
	t.Cleanup(srv.Close)
	return srv
}

type tokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}

func call(t *testing.T, method, url, token string, body any, want int, out any) {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, url, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != want {
		b, _ := io.ReadAll(res.Body)
		t.Fatalf("%s %s: status = %d, esperado %d (%s)", method, url, res.StatusCode, want, b)
	}
	if out != nil {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			t.Fatal(err)
		}
	}
}

func register(t *testing.T, srv *httptest.Server, email, user string) tokenPair {
	t.Helper()
	var tp tokenPair
	call(t, "POST", srv.URL+"/v1/auth/register", "", map[string]string{
		"email": email, "username": user, "password": "senha-forte-123"}, http.StatusCreated, &tp)
	return tp
}

func TestRegisterLoginAndMe(t *testing.T) {
	srv := newAuthServer(t)

	tp := register(t, srv, "yugi@example.com", "yugi")
	if tp.AccessToken == "" || tp.RefreshToken == "" || tp.ExpiresIn != 60 {
		t.Fatalf("tokens inesperados: %+v", tp)
	}

	var login tokenPair
	call(t, "POST", srv.URL+"/v1/auth/login", "", map[string]string{
		"email": "YUGI@example.com", "password": "senha-forte-123"}, http.StatusOK, &login)

	var me map[string]any
	call(t, "GET", srv.URL+"/v1/me", login.AccessToken, nil, http.StatusOK, &me)
	if me["username"] != "yugi" {
		t.Errorf("username = %v", me["username"])
	}
	if _, leaked := me["email"]; leaked {
		t.Error("perfil não deveria expor o e-mail")
	}
	if _, leaked := me["passwordHash"]; leaked {
		t.Error("perfil expôs o hash da senha")
	}

	var upd map[string]any
	call(t, "PATCH", srv.URL+"/v1/me", login.AccessToken, map[string]string{"bio": "Rei dos Jogos"}, http.StatusOK, &upd)
	if upd["bio"] != "Rei dos Jogos" {
		t.Errorf("bio = %v", upd["bio"])
	}
}

// A foto de perfil é uma carta: o perfil devolve o id e a URL da imagem; 0 remove; carta inexistente e id negativo dão 422.
func TestProfileAvatarCard(t *testing.T) {
	srv := newAuthServer(t)
	tp := register(t, srv, "kaiba@example.com", "kaiba")

	var me map[string]any
	call(t, "GET", srv.URL+"/v1/me", tp.AccessToken, nil, http.StatusOK, &me)
	if me["avatarCardId"] != nil || me["avatarUrl"] != nil {
		t.Errorf("sem foto escolhida, esperava avatar vazio: %v / %v", me["avatarCardId"], me["avatarUrl"])
	}

	var upd map[string]any
	call(t, "PATCH", srv.URL+"/v1/me", tp.AccessToken, map[string]any{"avatarCardId": 139}, http.StatusOK, &upd)
	if upd["avatarCardId"] != float64(139) || upd["avatarUrl"] != "http://img/cards_small/139.jpg" {
		t.Errorf("avatar = %v / %v", upd["avatarCardId"], upd["avatarUrl"])
	}

	// Alterar só a bio não mexe na foto.
	call(t, "PATCH", srv.URL+"/v1/me", tp.AccessToken, map[string]any{"bio": "oi"}, http.StatusOK, &upd)
	if upd["avatarUrl"] != "http://img/cards_small/139.jpg" {
		t.Errorf("a bio apagou a foto: %v", upd["avatarUrl"])
	}

	var problem struct {
		Errors []struct{ Field string } `json:"errors"`
	}
	call(t, "PATCH", srv.URL+"/v1/me", tp.AccessToken, map[string]any{"avatarCardId": 99999}, http.StatusUnprocessableEntity, &problem)
	if len(problem.Errors) != 1 || problem.Errors[0].Field != "avatarCardId" {
		t.Errorf("carta inexistente: erros = %+v", problem.Errors)
	}
	call(t, "PATCH", srv.URL+"/v1/me", tp.AccessToken, map[string]any{"avatarCardId": -5}, http.StatusUnprocessableEntity, &problem)

	upd = nil // o JSON sem o campo não apagaria a chave antiga do mapa
	call(t, "PATCH", srv.URL+"/v1/me", tp.AccessToken, map[string]any{"avatarCardId": 0}, http.StatusOK, &upd)
	if upd["avatarCardId"] != nil || upd["avatarUrl"] != nil {
		t.Errorf("0 deveria remover a foto: %v / %v", upd["avatarCardId"], upd["avatarUrl"])
	}
}

func TestRegisterValidationAndConflict(t *testing.T) {
	srv := newAuthServer(t)

	var p struct {
		Errors []struct{ Field string } `json:"errors"`
	}
	call(t, "POST", srv.URL+"/v1/auth/register", "", map[string]string{
		"email": "ok@example.com", "username": "a!", "password": "curta"}, http.StatusUnprocessableEntity, &p)
	if len(p.Errors) != 2 {
		t.Errorf("esperava 2 erros de campo, vieram %+v", p.Errors)
	}
	// E-mail malformado é barrado já na decodificação do JSON.
	call(t, "POST", srv.URL+"/v1/auth/register", "", map[string]string{
		"email": "nao-e-email", "username": "valido", "password": "senha-forte-123"}, http.StatusBadRequest, nil)

	register(t, srv, "kaiba@example.com", "kaiba")
	call(t, "POST", srv.URL+"/v1/auth/register", "", map[string]string{
		"email": "kaiba@example.com", "username": "outro", "password": "senha-forte-123"}, http.StatusConflict, nil)
}

func TestLoginWrongCredentialsIs401(t *testing.T) {
	srv := newAuthServer(t)
	register(t, srv, "joey@example.com", "joey")

	for _, c := range []map[string]string{
		{"email": "joey@example.com", "password": "errada-errada"},
		{"email": "ninguem@example.com", "password": "senha-forte-123"},
	} {
		call(t, "POST", srv.URL+"/v1/auth/login", "", c, http.StatusUnauthorized, nil)
	}
}

func TestProtectedRoutesRequireValidToken(t *testing.T) {
	srv := newAuthServer(t)

	call(t, "GET", srv.URL+"/v1/me", "", nil, http.StatusUnauthorized, nil)
	call(t, "GET", srv.URL+"/v1/me", "lixo.lixo.lixo", nil, http.StatusUnauthorized, nil)

	expired := auth.NewTokens("test-secret-test-secret-test-secret-12", -time.Minute, time.Hour)
	tok, _ := expired.NewAccessToken(uuid.NewString())
	call(t, "GET", srv.URL+"/v1/me", tok, nil, http.StatusUnauthorized, nil)

	wrongKey := auth.NewTokens("outro-segredo-outro-segredo-outro-12", time.Minute, time.Hour)
	tok, _ = wrongKey.NewAccessToken(uuid.NewString())
	call(t, "GET", srv.URL+"/v1/me", tok, nil, http.StatusUnauthorized, nil)

	// Público continua público.
	call(t, "GET", srv.URL+"/v1/cards?limit=1", "", nil, http.StatusOK, nil)
}

func TestRefreshRotatesAndLogoutRevokes(t *testing.T) {
	srv := newAuthServer(t)
	tp := register(t, srv, "mai@example.com", "mai")

	var next tokenPair
	call(t, "POST", srv.URL+"/v1/auth/refresh", "", map[string]string{"refreshToken": tp.RefreshToken}, http.StatusOK, &next)
	if next.RefreshToken == tp.RefreshToken {
		t.Error("refresh token não foi rotacionado")
	}
	// O antigo não pode ser reutilizado.
	call(t, "POST", srv.URL+"/v1/auth/refresh", "", map[string]string{"refreshToken": tp.RefreshToken}, http.StatusUnauthorized, nil)

	call(t, "POST", srv.URL+"/v1/auth/logout", next.AccessToken, map[string]string{"refreshToken": next.RefreshToken}, http.StatusNoContent, nil)
	call(t, "POST", srv.URL+"/v1/auth/refresh", "", map[string]string{"refreshToken": next.RefreshToken}, http.StatusUnauthorized, nil)
	call(t, "POST", srv.URL+"/v1/auth/logout", "", map[string]string{"refreshToken": "x"}, http.StatusUnauthorized, nil)
}

func TestTokensRoundTrip(t *testing.T) {
	tk := auth.NewTokens("test-secret-test-secret-test-secret-12", time.Minute, time.Hour)
	tok, err := tk.NewAccessToken("abc")
	if err != nil {
		t.Fatal(err)
	}
	if id, err := tk.ParseAccessToken(tok); err != nil || id != "abc" {
		t.Fatalf("id=%q err=%v", id, err)
	}
	// alg=none nunca pode ser aceito
	none := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhYmMiLCJleHAiOjk5OTk5OTk5OTl9."
	if _, err := tk.ParseAccessToken(none); err == nil {
		t.Error("token com alg=none foi aceito")
	}
}
