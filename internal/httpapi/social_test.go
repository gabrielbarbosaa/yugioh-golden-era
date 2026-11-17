package httpapi

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/golden-era/api/internal/store"
)

// fakeSocial implementa SocialStore em memória sobre os fakes de decks e usuários.
type fakeSocial struct {
	decks    *fakeDecks
	users    *fakeUsers
	likes    map[[2]string]bool
	comments []store.Comment
}

func (f *fakeSocial) public(deckID string) bool {
	f.decks.mu.Lock()
	defer f.decks.mu.Unlock()
	d, ok := f.decks.decks[deckID]
	return ok && d.Visibility == "public"
}

func (f *fakeSocial) Like(_ context.Context, deckID, userID string) error {
	if !f.public(deckID) {
		return store.ErrNotFound
	}
	if !f.likes[[2]string{deckID, userID}] {
		f.likes[[2]string{deckID, userID}] = true
		f.decks.mu.Lock()
		f.decks.decks[deckID].LikeCount++
		f.decks.mu.Unlock()
	}
	return nil
}

func (f *fakeSocial) Unlike(_ context.Context, deckID, userID string) error {
	if f.likes[[2]string{deckID, userID}] {
		delete(f.likes, [2]string{deckID, userID})
		f.decks.mu.Lock()
		if d, ok := f.decks.decks[deckID]; ok {
			d.LikeCount--
		}
		f.decks.mu.Unlock()
	}
	return nil
}

func (f *fakeSocial) ListComments(_ context.Context, deckID string, _ *store.CommentCursor, limit int) ([]store.Comment, bool, error) {
	if !f.public(deckID) {
		return nil, false, store.ErrNotFound
	}
	var out []store.Comment
	for i := len(f.comments) - 1; i >= 0; i-- { // mais novo primeiro
		out = append(out, f.comments[i])
	}
	if len(out) > limit {
		return out[:limit], true, nil
	}
	return out, false, nil
}

func (f *fakeSocial) CreateComment(_ context.Context, deckID, authorID, body string) (store.Comment, error) {
	if !f.public(deckID) {
		return store.Comment{}, store.ErrNotFound
	}
	c := store.Comment{ID: uuid.NewString(), Body: body, CreatedAt: time.Now(), Author: f.decks.owner(authorID)}
	f.comments = append(f.comments, c)
	return c, nil
}

func (f *fakeSocial) Follow(_ context.Context, followerID, username string) error {
	f.users.mu.Lock()
	defer f.users.mu.Unlock()
	for _, u := range f.users.users {
		if u.Username == username {
			if u.ID == followerID {
				return store.ErrSelfFollow
			}
			for _, fo := range f.users.follows {
				if fo == [2]string{followerID, u.ID} {
					return nil
				}
			}
			f.users.follows = append(f.users.follows, [2]string{followerID, u.ID})
			return nil
		}
	}
	return store.ErrNotFound
}

func (f *fakeSocial) Unfollow(_ context.Context, followerID, username string) error {
	f.users.mu.Lock()
	defer f.users.mu.Unlock()
	for _, u := range f.users.users {
		if u.Username == username {
			kept := f.users.follows[:0]
			for _, fo := range f.users.follows {
				if fo != [2]string{followerID, u.ID} {
					kept = append(kept, fo)
				}
			}
			f.users.follows = kept
		}
	}
	return nil
}

type commentResp struct {
	ID     string `json:"id"`
	Body   string `json:"body"`
	Author struct{ Username string }
}

func TestLikes(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	kaiba := register(t, srv, "kaiba@example.com", "kaiba").AccessToken

	var pub, priv deckResp
	call(t, "POST", srv.URL+"/v1/decks", yugi, publicDraft("Meta"), http.StatusCreated, &pub)
	call(t, "POST", srv.URL+"/v1/decks", yugi, draft("rascunho", "private"), http.StatusCreated, &priv)

	likes := func() int {
		var d struct{ LikeCount int }
		call(t, "GET", srv.URL+"/v1/decks/"+pub.ID, "", nil, http.StatusOK, &d)
		return d.LikeCount
	}

	call(t, "PUT", srv.URL+"/v1/decks/"+pub.ID+"/like", kaiba, nil, http.StatusNoContent, nil)
	call(t, "PUT", srv.URL+"/v1/decks/"+pub.ID+"/like", kaiba, nil, http.StatusNoContent, nil) // idempotente
	if n := likes(); n != 1 {
		t.Errorf("curtir duas vezes deve contar 1, contou %d", n)
	}
	call(t, "DELETE", srv.URL+"/v1/decks/"+pub.ID+"/like", kaiba, nil, http.StatusNoContent, nil)
	call(t, "DELETE", srv.URL+"/v1/decks/"+pub.ID+"/like", kaiba, nil, http.StatusNoContent, nil) // idempotente
	if n := likes(); n != 0 {
		t.Errorf("após descurtir deveria ser 0, é %d", n)
	}

	call(t, "PUT", srv.URL+"/v1/decks/"+priv.ID+"/like", kaiba, nil, http.StatusNotFound, nil)
	call(t, "PUT", srv.URL+"/v1/decks/"+uuid.NewString()+"/like", kaiba, nil, http.StatusNotFound, nil)
	call(t, "PUT", srv.URL+"/v1/decks/"+pub.ID+"/like", "", nil, http.StatusUnauthorized, nil)
}

func TestComments(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	kaiba := register(t, srv, "kaiba@example.com", "kaiba").AccessToken

	var pub, priv deckResp
	call(t, "POST", srv.URL+"/v1/decks", yugi, publicDraft("Meta"), http.StatusCreated, &pub)
	call(t, "POST", srv.URL+"/v1/decks", yugi, draft("rascunho", "private"), http.StatusCreated, &priv)

	var c commentResp
	call(t, "POST", srv.URL+"/v1/decks/"+pub.ID+"/comments", kaiba, map[string]string{"body": "  Bom deck!  "}, http.StatusCreated, &c)
	if c.Body != "Bom deck!" || c.Author.Username != "kaiba" {
		t.Errorf("comentário inesperado: %+v", c)
	}

	// Validação.
	for _, body := range []string{"", "   ", strings.Repeat("a", 1001)} {
		call(t, "POST", srv.URL+"/v1/decks/"+pub.ID+"/comments", kaiba, map[string]string{"body": body}, http.StatusUnprocessableEntity, nil)
	}
	call(t, "POST", srv.URL+"/v1/decks/"+priv.ID+"/comments", kaiba, map[string]string{"body": "oi"}, http.StatusNotFound, nil)
	call(t, "POST", srv.URL+"/v1/decks/"+pub.ID+"/comments", "", map[string]string{"body": "oi"}, http.StatusUnauthorized, nil)

	// A listagem é pública, mas só para decks públicos.
	var page struct{ Items []commentResp }
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID+"/comments", "", nil, http.StatusOK, &page)
	if len(page.Items) != 1 || page.Items[0].Body != "Bom deck!" {
		t.Errorf("lista = %+v", page.Items)
	}
	call(t, "GET", srv.URL+"/v1/decks/"+priv.ID+"/comments", "", nil, http.StatusNotFound, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID+"/comments?limit=0", "", nil, http.StatusBadRequest, nil)
	call(t, "GET", srv.URL+"/v1/decks/"+pub.ID+"/comments?cursor=lixo", "", nil, http.StatusBadRequest, nil)
}

func TestFollowAndPublicProfile(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi").AccessToken
	kaiba := register(t, srv, "kaiba@example.com", "kaiba").AccessToken

	type profile struct {
		Username      string
		FollowerCount int
		FollowedByMe  bool
	}
	var p profile
	call(t, "GET", srv.URL+"/v1/users/yugi", "", nil, http.StatusOK, &p)
	if p.Username != "yugi" || p.FollowerCount != 0 || p.FollowedByMe {
		t.Fatalf("perfil inicial = %+v", p)
	}

	call(t, "PUT", srv.URL+"/v1/users/yugi/follow", kaiba, nil, http.StatusNoContent, nil)
	call(t, "PUT", srv.URL+"/v1/users/yugi/follow", kaiba, nil, http.StatusNoContent, nil) // idempotente

	call(t, "GET", srv.URL+"/v1/users/yugi", kaiba, nil, http.StatusOK, &p)
	if p.FollowerCount != 1 || !p.FollowedByMe {
		t.Errorf("com o kaiba logado: %+v", p)
	}
	call(t, "GET", srv.URL+"/v1/users/yugi", "", nil, http.StatusOK, &p)
	if p.FollowerCount != 1 || p.FollowedByMe {
		t.Errorf("anônimo: %+v", p)
	}

	call(t, "PUT", srv.URL+"/v1/users/yugi/follow", yugi, nil, http.StatusBadRequest, nil) // a si mesmo
	call(t, "PUT", srv.URL+"/v1/users/ninguem/follow", kaiba, nil, http.StatusNotFound, nil)
	call(t, "PUT", srv.URL+"/v1/users/yugi/follow", "", nil, http.StatusUnauthorized, nil)

	call(t, "DELETE", srv.URL+"/v1/users/yugi/follow", kaiba, nil, http.StatusNoContent, nil)
	call(t, "GET", srv.URL+"/v1/users/yugi", kaiba, nil, http.StatusOK, &p)
	if p.FollowerCount != 0 || p.FollowedByMe {
		t.Errorf("após deixar de seguir: %+v", p)
	}
	call(t, "GET", srv.URL+"/v1/users/ninguem", "", nil, http.StatusNotFound, nil)
}
