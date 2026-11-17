package ingest

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxImageBytes = 20 << 20 // 20 MiB

// Downloader baixa cada imagem uma única vez, com intervalo entre downloads e retomada:
// arquivos que já existem são ignorados.
type Downloader struct {
	Client   *Client
	Dir      string        // raiz das imagens, ex.: .data/images
	Interval time.Duration // pausa mínima entre downloads (0 = sem pausa)
}

// DownloadResult resume uma execução.
type DownloadResult struct {
	Downloaded int
	Skipped    int
	Failed     []string // URLs de origem que falharam
}

type job struct{ src, rel string }

// Run baixa as imagens grande e pequena de cada carta. Se limit > 0, processa só as primeiras
// limit cartas (útil para um teste rápido). progress, se não nulo, é chamado após cada arquivo.
func (d *Downloader) Run(ctx context.Context, cards []Card, limit int, progress func(done, total int)) (DownloadResult, error) {
	if limit > 0 && limit < len(cards) {
		cards = cards[:limit]
	}
	var jobs []job
	for _, c := range cards {
		if c.ImageURL != "" {
			jobs = append(jobs, job{c.ImageURL, c.ImageFile})
		}
		if c.ImageSmallURL != "" {
			jobs = append(jobs, job{c.ImageSmallURL, c.ImageSmallFile})
		}
	}

	var res DownloadResult
	var last time.Time
	for i, j := range jobs {
		dst := filepath.Join(d.Dir, filepath.FromSlash(j.rel))
		if fi, err := os.Stat(dst); err == nil && fi.Size() > 0 {
			res.Skipped++
		} else {
			if err := d.pause(ctx, last); err != nil {
				return res, err
			}
			last = time.Now()
			if err := d.fetchTo(ctx, j.src, dst); err != nil {
				if errors.Is(err, ErrRateLimited) || ctx.Err() != nil {
					return res, err
				}
				res.Failed = append(res.Failed, j.src)
			} else {
				res.Downloaded++
			}
		}
		if progress != nil {
			progress(i+1, len(jobs))
		}
	}
	return res, nil
}

func (d *Downloader) pause(ctx context.Context, last time.Time) error {
	if d.Interval <= 0 || last.IsZero() {
		return ctx.Err()
	}
	wait := d.Interval - time.Since(last)
	if wait <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (d *Downloader) fetchTo(ctx context.Context, src, dst string) error {
	resp, err := d.Client.do(ctx, src)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d em %s", resp.StatusCode, src)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "image/") {
		return fmt.Errorf("Content-Type inesperado %q em %s", ct, src)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}

	tmp := dst + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(f, io.LimitReader(resp.Body, maxImageBytes))
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil || n == 0 {
		_ = os.Remove(tmp)
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		return fmt.Errorf("imagem vazia em %s", src)
	}
	return os.Rename(tmp, dst)
}
