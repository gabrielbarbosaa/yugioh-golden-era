package httpapi

import (
	"sync"
	"time"
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
