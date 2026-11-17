package httpapi

import (
	"net/http"
	"strings"
)

// cors libera as origens da lista (ou todas, com "*") a chamar a API pelo navegador.
// Apps nativos não usam CORS; isto serve ao preview web do Expo e ao site em Next.js.
// A API autentica por Bearer token (nunca por cookie), então não enviamos credenciais.
func cors(origins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	any := false
	for _, o := range origins {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		switch {
		case o == "*":
			any = true
		case o != "":
			allowed[o] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" || !(any || allowed[origin]) {
				next.ServeHTTP(w, r)
				return
			}
			h := w.Header()
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Expose-Headers", "X-Request-Id")

			// Preflight: responde direto, sem passar pelas rotas (que só registram o método real).
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
