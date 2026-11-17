// Package migrations embute os arquivos SQL do goose para que o binário da API possa aplicá-los.
package migrations

import "embed"

// FS contém os arquivos *.sql desta pasta.
//
//go:embed *.sql
var FS embed.FS
