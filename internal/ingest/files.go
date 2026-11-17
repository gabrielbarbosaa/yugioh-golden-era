package ingest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// WriteJSON grava v de forma atômica (arquivo temporário + rename).
func WriteJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ReadCardsFile lê um cards.json gerado anteriormente.
func ReadCardsFile(path string) (CardsFile, error) {
	var f CardsFile
	b, err := os.ReadFile(path)
	if err != nil {
		return f, err
	}
	if err := json.Unmarshal(b, &f); err != nil {
		return f, fmt.Errorf("%s inválido: %w", path, err)
	}
	return f, nil
}

// ReadSetsFile lê um sets.json gerado anteriormente.
func ReadSetsFile(path string) ([]APISet, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sets []APISet
	if err := json.Unmarshal(b, &sets); err != nil {
		return nil, fmt.Errorf("%s inválido: %w", path, err)
	}
	return sets, nil
}
