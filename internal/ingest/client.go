package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultBaseURL é a versão atual da API pública do YGOPRODeck.
const DefaultBaseURL = "https://db.ygoprodeck.com/api/v7"

const maxJSONBody = 128 << 20 // 128 MiB

// ErrRateLimited indica HTTP 429. A API bloqueia o IP por 1 hora ao exceder o limite,
// então insistir só piora: o fluxo é interrompido.
var ErrRateLimited = errors.New("limite de requisições excedido (HTTP 429); aguarde cerca de 1 hora antes de tentar de novo")

// Client faz requisições HTTP educadas: User-Agent identificado, retentativas com backoff
// para falhas transitórias e nenhuma retentativa em 429.
type Client struct {
	BaseURL   string
	HTTP      *http.Client
	UserAgent string
	Retries   int
	Backoff   time.Duration
}

// NewClient cria um cliente com padrões seguros.
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		HTTP:      &http.Client{Timeout: 90 * time.Second},
		UserAgent: "golden-era-ingest/0.1 (projeto de fã, sem fins lucrativos)",
		Retries:   3,
		Backoff:   2 * time.Second,
	}
}

// Cards busca de uma só vez todas as cartas da era.
func (c *Client) Cards(ctx context.Context, era Era) ([]APICard, error) {
	q := url.Values{}
	q.Set("startdate", era.Start)
	q.Set("enddate", era.End)
	q.Set("dateregion", era.Region)
	q.Set("misc", "yes")

	var resp struct {
		Data  []APICard `json:"data"`
		Error string    `json:"error"`
	}
	if err := c.getJSON(ctx, c.BaseURL+"/cardinfo.php?"+q.Encode(), &resp); err != nil {
		return nil, err
	}
	if resp.Error != "" {
		return nil, fmt.Errorf("a API respondeu com erro: %s", resp.Error)
	}
	return resp.Data, nil
}

// Sets busca a lista completa de sets.
func (c *Client) Sets(ctx context.Context) ([]APISet, error) {
	var sets []APISet
	if err := c.getJSON(ctx, c.BaseURL+"/cardsets.php", &sets); err != nil {
		return nil, err
	}
	return sets, nil
}

func (c *Client) getJSON(ctx context.Context, rawURL string, v any) error {
	resp, err := c.do(ctx, rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxJSONBody))
	if err != nil {
		return fmt.Errorf("lendo resposta: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, snippet(body))
	}
	if err := json.Unmarshal(body, v); err != nil {
		return fmt.Errorf("resposta não é JSON válido: %w", err)
	}
	return nil
}

// do executa um GET com retentativas para erros de rede e 5xx. HTTP 429 devolve ErrRateLimited.
func (c *Client) do(ctx context.Context, rawURL string) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= c.Retries; attempt++ {
		if attempt > 0 {
			wait := c.Backoff << (attempt - 1)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(wait):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", c.UserAgent)

		resp, err := c.HTTP.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			lastErr = err
			continue
		}
		switch {
		case resp.StatusCode == http.StatusTooManyRequests:
			resp.Body.Close()
			return nil, ErrRateLimited
		case resp.StatusCode >= 500:
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
			resp.Body.Close()
			lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
			continue
		}
		return resp, nil
	}
	return nil, fmt.Errorf("falhou após %d tentativas: %w", c.Retries+1, lastErr)
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return s
}
