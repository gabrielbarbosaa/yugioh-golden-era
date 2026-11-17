package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"
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
