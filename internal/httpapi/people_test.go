package httpapi

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"testing"

	"github.com/golden-era/api/internal/store"
)

// page devolve os usernames do fake, filtrados e em ordem, depois de `after`, até `limit` (mais um se houver).
func (f *fakeUsers) page(match func(store.User) bool, after string, limit int) ([]store.DeckOwner, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var names []string
	byName := map[string]store.User{}
	for _, u := range f.users {
		if match(u) && (after == "" || strings.ToLower(u.Username) > strings.ToLower(after)) {
			names = append(names, u.Username)
			byName[u.Username] = u
		}
	}
	sort.Slice(names, func(i, j int) bool { return strings.ToLower(names[i]) < strings.ToLower(names[j]) })
	more := len(names) > limit
	if more {
		names = names[:limit]
	}
	out := make([]store.DeckOwner, 0, len(names))
	for _, n := range names {
		u := byName[n]
		out = append(out, store.DeckOwner{ID: u.ID, Username: u.Username, AvatarCardID: u.AvatarCardID, AvatarPath: u.AvatarPath})
	}
	return out, more
}

func (f *fakeUsers) Search(_ context.Context, q, after string, limit int) ([]store.DeckOwner, bool, error) {
	out, more := f.page(func(u store.User) bool { return strings.Contains(strings.ToLower(u.Username), strings.ToLower(q)) }, after, limit)
	return out, more, nil
}

func (f *fakeUsers) idOf(username string) (string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.users {
		if strings.EqualFold(u.Username, username) {
			return u.ID, true
		}
	}
	return "", false
}

func (f *fakeUsers) Followers(_ context.Context, username, after string, limit int) ([]store.DeckOwner, bool, error) {
	id, ok := f.idOf(username)
	if !ok {
		return nil, false, store.ErrNotFound
	}
	out, more := f.page(func(u store.User) bool {
		for _, fo := range f.follows {
			if fo[0] == u.ID && fo[1] == id {
				return true
			}
		}
		return false
	}, after, limit)
	return out, more, nil
}

func (f *fakeUsers) Following(_ context.Context, username, after string, limit int) ([]store.DeckOwner, bool, error) {
	id, ok := f.idOf(username)
	if !ok {
		return nil, false, store.ErrNotFound
	}
	out, more := f.page(func(u store.User) bool {
		for _, fo := range f.follows {
			if fo[1] == u.ID && fo[0] == id {
				return true
			}
		}
		return false
	}, after, limit)
	return out, more, nil
}

type userPage struct {
	Items []struct {
		Username string `json:"username"`
	} `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

func names(p userPage) string {
	var out []string
	for _, it := range p.Items {
		out = append(out, it.Username)
	}
	return strings.Join(out, ",")
}

// Busca por trecho do nome (sem diferenciar maiúsculas), paginada por username; exige q.
func TestSearchUsers(t *testing.T) {
	srv := newAuthServer(t)
	for _, n := range []string{"yugi_muto", "kaiba", "yugi_fan", "joey", "Yugioh_Pro"} {
		register(t, srv, n+"@example.com", n)
	}

	var p userPage
	call(t, "GET", srv.URL+"/v1/users?q=YUGI", "", nil, http.StatusOK, &p) // anônimo pode buscar
	if got := names(p); got != "yugi_fan,yugi_muto,Yugioh_Pro" || p.NextCursor != nil {
		t.Fatalf("busca = %q (cursor %v)", got, p.NextCursor)
	}

	// Paginação: duas por página, a segunda começa depois do cursor.
	p = userPage{}
	call(t, "GET", srv.URL+"/v1/users?q=yugi&limit=2", "", nil, http.StatusOK, &p)
	if names(p) != "yugi_fan,yugi_muto" || p.NextCursor == nil {
		t.Fatalf("página 1 = %q (cursor %v)", names(p), p.NextCursor)
	}
	cursor := *p.NextCursor
	p = userPage{}
	call(t, "GET", srv.URL+"/v1/users?q=yugi&limit=2&cursor="+cursor, "", nil, http.StatusOK, &p)
	if names(p) != "Yugioh_Pro" || p.NextCursor != nil {
		t.Fatalf("página 2 = %q (cursor %v)", names(p), p.NextCursor)
	}

	p = userPage{}
	call(t, "GET", srv.URL+"/v1/users?q=zzz", "", nil, http.StatusOK, &p)
	if len(p.Items) != 0 {
		t.Errorf("busca sem resultado trouxe %q", names(p))
	}
	call(t, "GET", srv.URL+"/v1/users", "", nil, http.StatusBadRequest, nil)                                     // q é obrigatório
	call(t, "GET", srv.URL+"/v1/users?q="+strings.Repeat("a", 25), "", nil, http.StatusUnprocessableEntity, nil) // longo demais
	call(t, "GET", srv.URL+"/v1/users?q=a&cursor=%25%25", "", nil, http.StatusBadRequest, nil)                   // cursor inválido
}

// Seguidores e seguindo: listas públicas, em ordem alfabética, 404 para usuário inexistente.
func TestFollowersAndFollowing(t *testing.T) {
	srv := newDeckServer(t)
	yugi := register(t, srv, "yugi@example.com", "yugi")
	register(t, srv, "kaiba@example.com", "kaiba")
	joey := register(t, srv, "joey@example.com", "joey")

	// joey e yugi seguem kaiba; yugi segue joey.
	call(t, "PUT", srv.URL+"/v1/users/kaiba/follow", joey.AccessToken, nil, http.StatusNoContent, nil)
	call(t, "PUT", srv.URL+"/v1/users/kaiba/follow", yugi.AccessToken, nil, http.StatusNoContent, nil)
	call(t, "PUT", srv.URL+"/v1/users/joey/follow", yugi.AccessToken, nil, http.StatusNoContent, nil)

	var p userPage
	call(t, "GET", srv.URL+"/v1/users/kaiba/followers", "", nil, http.StatusOK, &p)
	if got := names(p); got != "joey,yugi" {
		t.Errorf("seguidores de kaiba = %q", got)
	}
	p = userPage{}
	call(t, "GET", srv.URL+"/v1/users/yugi/following", "", nil, http.StatusOK, &p)
	if got := names(p); got != "joey,kaiba" {
		t.Errorf("yugi segue = %q", got)
	}
	p = userPage{}
	call(t, "GET", srv.URL+"/v1/users/yugi/followers", "", nil, http.StatusOK, &p)
	if len(p.Items) != 0 {
		t.Errorf("yugi não tem seguidores, veio %q", names(p))
	}
	p = userPage{}
	call(t, "GET", srv.URL+"/v1/users/kaiba/followers?limit=1", "", nil, http.StatusOK, &p)
	if names(p) != "joey" || p.NextCursor == nil || *p.NextCursor != "joey" {
		t.Errorf("página com limit=1 = %q (cursor %v)", names(p), p.NextCursor)
	}

	call(t, "GET", srv.URL+"/v1/users/ninguem/followers", "", nil, http.StatusNotFound, nil)
	call(t, "GET", srv.URL+"/v1/users/ninguem/following", "", nil, http.StatusNotFound, nil)
}
