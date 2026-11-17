// Package api embute o contrato OpenAPI, que é a fonte única de verdade da API.
package api

import _ "embed"

// Regenera internal/api/gen a partir do contrato (rode `go generate ./...` na raiz).
//go:generate go tool oapi-codegen -config ../oapi-codegen.yaml -o ../internal/api/gen/api.gen.go openapi.yaml

// Spec contém o conteúdo bruto de openapi.yaml.
//
//go:embed openapi.yaml
var Spec []byte
