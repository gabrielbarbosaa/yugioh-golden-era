package httpapi

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golden-era/api/internal/api/gen"
)

// Política do login: depois de loginMaxFails senhas erradas para o mesmo e-mail dentro da janela,
// novas tentativas são recusadas (429) até a janela acabar. Só falhas contam, e um login correto zera
// o contador, então quem acerta a senha nunca é limitado antes de errar várias vezes.
//
// O limite é por conta (e-mail), não por IP: atrás de um proxy ou do servidor do site todos os usuários
// chegam do mesmo IP. A contrapartida é que alguém pode travar a conta de outra pessoa por 15 minutos
// errando a senha de propósito; é o preço de barrar tentativas de adivinhar a senha.
const (
	loginMaxFails = 5
	loginWindow   = 15 * time.Minute

	// Acima disto varremos as entradas vencidas, para o mapa não crescer sem limite.
	limiterSweepAt = 4096
)

type failures struct {
	count   int
	resetAt time.Time // fim da janela, contado a partir da primeira falha
}

// loginLimiter conta falhas de login por chave (e-mail normalizado). É seguro para uso concorrente.
type loginLimiter struct {
	mu      sync.Mutex
	max     int
	window  time.Duration
	now     func() time.Time
	entries map[string]*failures
}

func newLoginLimiter(max int, window time.Duration) *loginLimiter {
	return &loginLimiter{max: max, window: window, now: time.Now, entries: make(map[string]*failures)}
}

// blocked informa se a chave está bloqueada e, nesse caso, quanto falta para a janela acabar.
func (l *loginLimiter) blocked(key string) (time.Duration, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	f, ok := l.entries[key]
	if !ok {
		return 0, false
	}
	now := l.now()
	if !now.Before(f.resetAt) {
		delete(l.entries, key)
		return 0, false
	}
	if f.count < l.max {
		return 0, false
	}
	return f.resetAt.Sub(now), true
}

// fail registra uma senha errada.
func (l *loginLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.entries) >= limiterSweepAt {
		for k, f := range l.entries {
			if !now.Before(f.resetAt) {
				delete(l.entries, k)
			}
		}
	}
	f, ok := l.entries[key]
	if !ok || !now.Before(f.resetAt) {
		f = &failures{resetAt: now.Add(l.window)}
		l.entries[key] = f
	}
	f.count++
}

// reset limpa a chave (login correto).
func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

// Cadastros: no máximo registerMaxPerIP por janela e por IP. Contam todas as tentativas (sucesso ou não), porque
// o que se quer barrar é a criação em massa de contas. Atrás de um proxy confiável, ligue TRUST_PROXY para usar o
// IP original (X-Forwarded-For); sem isso, vale o IP da conexão. O site Next.js chama a API do próprio servidor,
// então todos os cadastros feitos pela web compartilham um IP e um mesmo limite.
const (
	registerMaxPerIP = 20
	registerWindow   = time.Hour
)

type counter struct {
	count   int
	resetAt time.Time
}

// ipLimiter conta tentativas por chave (IP) numa janela fixa. É seguro para uso concorrente.
type ipLimiter struct {
	mu      sync.Mutex
	max     int
	window  time.Duration
	now     func() time.Time
	entries map[string]*counter
}

func newIPLimiter(max int, window time.Duration) *ipLimiter {
	return &ipLimiter{max: max, window: window, now: time.Now, entries: make(map[string]*counter)}
}

// allow registra uma tentativa e informa se ela cabe no limite; se não, devolve quanto falta para a janela acabar.
func (l *ipLimiter) allow(key string) (time.Duration, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.entries) >= limiterSweepAt {
		for k, c := range l.entries {
			if !now.Before(c.resetAt) {
				delete(l.entries, k)
			}
		}
	}
	c, ok := l.entries[key]
	if !ok || !now.Before(c.resetAt) {
		c = &counter{resetAt: now.Add(l.window)}
		l.entries[key] = c
	}
	if c.count >= l.max {
		return c.resetAt.Sub(now), false
	}
	c.count++
	return 0, true
}

type clientIPKey struct{}

// clientIP devolve o IP do cliente: o da conexão, ou o primeiro de X-Forwarded-For quando há proxy confiável.
func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if first, _, _ := strings.Cut(r.Header.Get("X-Forwarded-For"), ","); strings.TrimSpace(first) != "" {
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// withClientIP guarda o IP do cliente no contexto dos handlers tipados (que não recebem o *http.Request).
func (a *apiServer) withClientIP(next gen.StrictHandlerFunc, _ string) gen.StrictHandlerFunc {
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request, req any) (any, error) {
		return next(context.WithValue(ctx, clientIPKey{}, clientIP(r, a.trustProxy)), w, r, req)
	}
}

func clientIPFrom(ctx context.Context) string {
	ip, _ := ctx.Value(clientIPKey{}).(string)
	return ip
}
