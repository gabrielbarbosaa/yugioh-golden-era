package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/golden-era/api/internal/auth"
)

// postJSON devolve a resposta crua, para conferir cabeçalhos que `call` não expõe.
func postJSON(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	res, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestLoginLimiterBlocksAfterMaxFailsAndExpires(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	l := newLoginLimiter(3, 10*time.Minute)
	l.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if _, blocked := l.blocked("a@x.com"); blocked {
			t.Fatalf("bloqueou cedo demais, na tentativa %d", i+1)
		}
		l.fail("a@x.com")
	}
	wait, blocked := l.blocked("a@x.com")
	if !blocked || wait != 10*time.Minute {
		t.Fatalf("esperava bloqueio de 10 min, veio blocked=%v wait=%v", blocked, wait)
	}
	if _, blocked := l.blocked("outra@x.com"); blocked {
		t.Error("o limite de uma conta não pode afetar outra")
	}

	now = now.Add(10 * time.Minute) // a janela acaba
	if _, blocked := l.blocked("a@x.com"); blocked {
		t.Error("deveria desbloquear quando a janela acaba")
	}
}

func TestLoginLimiterResetAndSweep(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	l := newLoginLimiter(2, time.Minute)
	l.now = func() time.Time { return now }

	l.fail("a@x.com")
	l.fail("a@x.com")
	l.reset("a@x.com")
	if _, blocked := l.blocked("a@x.com"); blocked {
		t.Error("reset deveria limpar o bloqueio")
	}

	// Entradas vencidas somem na varredura, então o mapa não cresce sem limite.
	for i := 0; i < limiterSweepAt; i++ {
		l.fail("k" + strconv.Itoa(i))
	}
	now = now.Add(2 * time.Minute)
	l.fail("novo@x.com")
	if n := len(l.entries); n != 1 {
		t.Errorf("entries = %d após a varredura, esperava 1", n)
	}
}

func TestLoginIsThrottledAfterRepeatedFailures(t *testing.T) {
	srv := newAuthServer(t)
	register(t, srv, "yugi@example.com", "yugi")
	wrong := map[string]string{"email": "Yugi@Example.com", "password": "errada-errada"}

	for i := 0; i < loginMaxFails; i++ {
		call(t, "POST", srv.URL+"/v1/auth/login", "", wrong, http.StatusUnauthorized, nil)
	}
	// Bloqueado: nem a senha certa passa enquanto durar a janela, e o e-mail é comparado sem maiúsculas.
	right := map[string]string{"email": "yugi@example.com", "password": "senha-forte-123"}
	res := postJSON(t, srv.URL+"/v1/auth/login", right)
	defer res.Body.Close()
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, esperado 429", res.StatusCode)
	}
	secs, err := strconv.Atoi(res.Header.Get("Retry-After"))
	if err != nil || secs < 1 || secs > int(loginWindow.Seconds())+1 {
		t.Errorf("Retry-After = %q", res.Header.Get("Retry-After"))
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/problem+json" {
		t.Errorf("Content-Type = %q", ct)
	}

	// Outra conta não é afetada.
	register(t, srv, "kaiba@example.com", "kaiba")
	call(t, "POST", srv.URL+"/v1/auth/login", "", map[string]string{
		"email": "kaiba@example.com", "password": "senha-forte-123"}, http.StatusOK, nil)
}

func TestSuccessfulLoginResetsFailureCount(t *testing.T) {
	srv := newAuthServer(t)
	register(t, srv, "yugi@example.com", "yugi")
	wrong := map[string]string{"email": "yugi@example.com", "password": "errada-errada"}
	right := map[string]string{"email": "yugi@example.com", "password": "senha-forte-123"}

	// Intercalar acertos impede o bloqueio: só falhas seguidas contam.
	for round := 0; round < 3; round++ {
		for i := 0; i < loginMaxFails-1; i++ {
			call(t, "POST", srv.URL+"/v1/auth/login", "", wrong, http.StatusUnauthorized, nil)
		}
		call(t, "POST", srv.URL+"/v1/auth/login", "", right, http.StatusOK, nil)
	}
}

func TestIPLimiterCountsPerKeyAndExpires(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	l := newIPLimiter(2, time.Hour)
	l.now = func() time.Time { return now }

	for i := 0; i < 2; i++ {
		if _, ok := l.allow("1.1.1.1"); !ok {
			t.Fatalf("tentativa %d deveria caber", i+1)
		}
	}
	wait, ok := l.allow("1.1.1.1")
	if ok || wait != time.Hour {
		t.Fatalf("3a tentativa: ok=%v wait=%v, esperado bloqueio de 1h", ok, wait)
	}
	if _, ok := l.allow("2.2.2.2"); !ok {
		t.Error("outro IP nao pode ser afetado")
	}
	now = now.Add(time.Hour)
	if _, ok := l.allow("1.1.1.1"); !ok {
		t.Error("deveria liberar quando a janela acaba")
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.5:51234"
	r.Header.Set("X-Forwarded-For", "203.0.113.7, 10.0.0.1")

	if got := clientIP(r, false); got != "10.0.0.5" {
		t.Errorf("sem proxy confiavel: %q (X-Forwarded-For deve ser ignorado)", got)
	}
	if got := clientIP(r, true); got != "203.0.113.7" {
		t.Errorf("com proxy confiavel: %q, esperado o primeiro de X-Forwarded-For", got)
	}
	r.Header.Del("X-Forwarded-For")
	if got := clientIP(r, true); got != "10.0.0.5" {
		t.Errorf("sem cabecalho cai para a conexao: %q", got)
	}
}

func registerBody(i int) map[string]string {
	n := strconv.Itoa(i)
	return map[string]string{"email": "u" + n + "@example.com", "username": "user_" + n, "password": "senha-forte-123"}
}

func TestRegisterIsThrottledPerIP(t *testing.T) {
	srv := newAuthServer(t)
	for i := 0; i < registerMaxPerIP; i++ {
		call(t, "POST", srv.URL+"/v1/auth/register", "", registerBody(i), http.StatusCreated, nil)
	}
	res := postJSON(t, srv.URL+"/v1/auth/register", registerBody(999))
	defer res.Body.Close()
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, esperado 429", res.StatusCode)
	}
	if secs, err := strconv.Atoi(res.Header.Get("Retry-After")); err != nil || secs < 1 {
		t.Errorf("Retry-After = %q", res.Header.Get("Retry-After"))
	}
	// Outras operacoes seguem funcionando para o mesmo IP.
	call(t, "POST", srv.URL+"/v1/auth/login", "", map[string]string{"email": "u0@example.com", "password": "senha-forte-123"}, http.StatusOK, nil)
}

func TestRegisterLimitUsesForwardedIPOnlyWhenTrusted(t *testing.T) {
	newServer := func(trust bool) *httptest.Server {
		log := slog.New(slog.NewTextHandler(io.Discard, nil))
		srv := httptest.NewServer(NewHandler(log, "test", Deps{
			Cards: &fakeCards{}, Users: newFakeUsers(), TrustProxy: trust,
			Tokens: auth.NewTokens("test-secret-test-secret-test-secret-12", time.Minute, time.Hour),
		}))
		t.Cleanup(srv.Close)
		return srv
	}
	post := func(srv *httptest.Server, i int, xff string) int {
		b, _ := json.Marshal(registerBody(i))
		req, _ := http.NewRequest("POST", srv.URL+"/v1/auth/register", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", xff)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		return res.StatusCode
	}

	// Confiando no proxy: IPs de origem diferentes tem limites independentes.
	trusted := newServer(true)
	for i := 0; i < registerMaxPerIP; i++ {
		post(trusted, i, "198.51.100.1")
	}
	if got := post(trusted, 100, "198.51.100.1"); got != http.StatusTooManyRequests {
		t.Errorf("mesmo IP de origem: %d, esperado 429", got)
	}
	if got := post(trusted, 101, "198.51.100.2"); got != http.StatusCreated {
		t.Errorf("outro IP de origem: %d, esperado 201", got)
	}

	// Sem confiar: variar o cabecalho nao burla o limite.
	untrusted := newServer(false)
	for i := 0; i < registerMaxPerIP; i++ {
		post(untrusted, i, "198.51.100."+strconv.Itoa(i))
	}
	if got := post(untrusted, 200, "203.0.113.99"); got != http.StatusTooManyRequests {
		t.Errorf("X-Forwarded-For forjado deveria ser ignorado: %d, esperado 429", got)
	}
}
