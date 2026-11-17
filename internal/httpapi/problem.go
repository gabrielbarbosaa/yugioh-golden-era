package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/golden-era/api/internal/api/gen"
)

// problem segue o formato RFC 7807, o mesmo descrito no contrato OpenAPI.
type problem struct {
	Type   string `json:"type,omitempty"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail,omitempty"`
}

func writeProblem(w http.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(problem{
		Type:   "about:blank",
		Title:  http.StatusText(status),
		Status: status,
		Detail: detail,
	})
}

// newProblem monta o tipo gerado a partir do contrato, usado nas respostas tipadas.
func newProblem(status int, detail string) gen.Problem {
	t := "about:blank"
	return gen.Problem{Type: &t, Title: http.StatusText(status), Status: status, Detail: &detail}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Erros devolvidos pelos handlers tipados e traduzidos em problem+json.
var errNotImplemented = errors.New("operação ainda não implementada")

type badRequestError string

func (e badRequestError) Error() string { return string(e) }

func badRequest(msg string) error { return badRequestError(msg) }
