// Package httpapi monta o roteador HTTP da API.
//
// As rotas de negócio vêm do código gerado a partir de api/openapi.yaml (strict server).
// Operações do contrato que ainda não têm handler respondem 501 até serem implementadas.
package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/golden-era/api/api"
	"github.com/golden-era/api/internal/api/gen"
)

// Deps reúne as dependências externas dos handlers.
type Deps struct {
	Cards        CardStore
	ImagesDir    string    // pasta servida em /images/ (vazio desliga a rota)
	ImageBaseURL string    // prefixo das URLs de imagem devolvidas nas cartas
	EraEnd       time.Time // limite superior da era, usado ao listar sets
}

// apiServer implementa as operações já prontas de gen.StrictServerInterface.
// As demais ficam no campo embutido (nil) e nunca são chamadas: veja notImplemented.
type apiServer struct {
	gen.StrictServerInterface

	version      string
	cards        CardStore
	imageBaseURL string
	eraEnd       time.Time
}

// implemented lista as operações (nome Go, como o gerador as passa ao middleware) que têm handler.
var implemented = map[string]bool{
	"GetHealth":      true,
	"ListCards":      true,
	"GetCard":        true,
	"ListArchetypes": true,
	"ListSets":       true,
}

func (a *apiServer) GetHealth(context.Context, gen.GetHealthRequestObject) (gen.GetHealthResponseObject, error) {
	return gen.GetHealth200JSONResponse{Status: gen.Ok, Version: a.version}, nil
}

// notImplemented barra operações sem handler antes de chegarem ao campo embutido nil.
func notImplemented(next gen.StrictHandlerFunc, operationID string) gen.StrictHandlerFunc {
	if implemented[operationID] {
		return next
	}
	return func(context.Context, http.ResponseWriter, *http.Request, any) (any, error) {
		return nil, errNotImplemented
	}
}

// NewHandler devolve o http.Handler completo da aplicação.
func NewHandler(log *slog.Logger, version string, deps Deps) http.Handler {
	mux := http.NewServeMux()

	srv := &apiServer{
		version:      version,
		cards:        deps.Cards,
		imageBaseURL: deps.ImageBaseURL,
		eraEnd:       deps.EraEnd,
	}
	strict := gen.NewStrictHandlerWithOptions(srv, []gen.StrictMiddlewareFunc{notImplemented}, gen.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeProblem(w, http.StatusBadRequest, err.Error())
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			var bad badRequestError
			switch {
			case errors.Is(err, errNotImplemented):
				writeProblem(w, http.StatusNotImplemented, err.Error())
			case errors.As(err, &bad):
				writeProblem(w, http.StatusBadRequest, bad.Error())
			default:
				log.Error("erro no handler", "error", err, "path", r.URL.Path)
				writeProblem(w, http.StatusInternalServerError, "erro interno")
			}
		},
	})
	gen.HandlerWithOptions(strict, gen.StdHTTPServerOptions{
		BaseURL:    "/v1",
		BaseRouter: mux,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeProblem(w, http.StatusBadRequest, err.Error())
		},
	})

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/docs", http.StatusFound)
	})
	mux.HandleFunc("GET /openapi.yaml", specHandler)
	mux.HandleFunc("GET /docs", docsHandler)
	if deps.ImagesDir != "" {
		mux.Handle("GET /images/", http.StripPrefix("/images/", imageHandler(deps.ImagesDir)))
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeProblem(w, http.StatusNotFound, "rota não encontrada")
	})

	return chain(mux, requestID, recoverer(log), accessLog(log))
}

// imageHandler serve arquivos de imagem sem listar diretórios.
func imageHandler(dir string) http.Handler {
	files := http.FileServer(noListingFS{http.Dir(dir)})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		files.ServeHTTP(w, r)
	})
}

// noListingFS faz diretórios virarem 404 em vez de uma listagem.
type noListingFS struct{ fs http.FileSystem }

func (n noListingFS) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	if st, err := f.Stat(); err != nil || st.IsDir() {
		_ = f.Close()
		return nil, os.ErrNotExist
	}
	return f, nil
}

func specHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	_, _ = w.Write(api.Spec)
}

// docsHandler serve o Swagger UI carregando os assets de um CDN.
// O navegador de quem lê a documentação precisa de acesso à internet.
func docsHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(swaggerHTML))
}

const swaggerHTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Golden Era API – Documentação</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/openapi.yaml",
      dom_id: "#swagger-ui",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true
    });
  </script>
</body>
</html>`
