package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

var testEra = Era{Region: "ocg", Start: "1999-01-01", End: "2003-12-31"}

// fakeAPI simula o YGOPRODeck e serve imagens fictícias.
func fakeAPI(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	var srv *httptest.Server

	mux.HandleFunc("/cardinfo.php", func(w http.ResponseWriter, r *http.Request) {
		cards := []map[string]any{
			{
				"id": 46986414, "name": "Dark Magician", "type": "Normal Monster", "frameType": "normal",
				"desc": "O mago supremo.", "atk": 2500, "def": 2100, "level": 7,
				"race": "Spellcaster", "attribute": "DARK", "archetype": "Dark Magician",
				"card_sets":   []map[string]any{{"set_name": "Legend of Blue Eyes White Dragon", "set_code": "LOB-EN005", "set_rarity": "Ultra Rare"}},
				"card_images": []map[string]any{{"id": 46986414, "image_url": srv.URL + "/img/46986414.jpg", "image_url_small": srv.URL + "/img/small/46986414.jpg"}},
				"misc_info":   []map[string]any{{"ocg_date": "1999-02-04", "tcg_date": "2002-03-08"}},
			},
			{
				"id": 23995346, "name": "Blue-Eyes Ultimate Dragon", "type": "Fusion Monster", "frameType": "fusion",
				"desc": "Fusão de três.", "atk": 4500, "def": 3800, "level": 12,
				"race": "Dragon", "attribute": "LIGHT",
				"card_images": []map[string]any{{"id": 23995346, "image_url": srv.URL + "/img/23995346.jpg", "image_url_small": srv.URL + "/img/small/23995346.jpg"}},
				"misc_info":   []map[string]any{{"ocg_date": "2000-07-13"}},
			},
			{
				"id": 5318639, "name": "Mystical Space Typhoon", "type": "Spell Card", "frameType": "spell",
				"desc": "Destrói uma magia ou armadilha.", "race": "Quick-Play",
				"card_images": []map[string]any{{"id": 5318639, "image_url": srv.URL + "/img/5318639.jpg", "image_url_small": srv.URL + "/img/small/5318639.jpg"}},
				"misc_info":   []map[string]any{{"ocg_date": "2002-05-23"}},
			},
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": cards})
	})
	mux.HandleFunc("/cardsets.php", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"set_name": "Legend of Blue Eyes White Dragon", "set_code": "LOB", "num_of_cards": 126, "tcg_date": "2002-03-08"},
		})
	})
	mux.HandleFunc("/img/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "5318639.jpg") && !strings.Contains(r.URL.Path, "small") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte("fake-jpeg-bytes"))
	})

	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func newTestClient(base string) *Client {
	c := NewClient(base)
	c.Backoff = time.Millisecond
	return c
}

func TestEraValidate(t *testing.T) {
	cases := []struct {
		name string
		era  Era
		ok   bool
	}{
		{"válida", testEra, true},
		{"região ruim", Era{"jp", "1999-01-01", "2003-12-31"}, false},
		{"data ruim", Era{"ocg", "01/01/1999", "2003-12-31"}, false},
		{"fim antes do início", Era{"ocg", "2003-12-31", "1999-01-01"}, false},
	}
	for _, tc := range cases {
		if err := tc.era.Validate(); (err == nil) != tc.ok {
			t.Errorf("%s: err = %v", tc.name, err)
		}
	}
}

func TestCardsSendsEraQueryAndMapsData(t *testing.T) {
	var gotQuery string
	api := fakeAPI(t)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cardinfo.php" {
			gotQuery = r.URL.RawQuery
		}
		resp, err := http.Get(api.URL + r.URL.RequestURI())
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.Copy(w, resp.Body)
	}))
	defer proxy.Close()

	raw, err := newTestClient(proxy.URL).Cards(context.Background(), testEra)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"startdate=1999-01-01", "enddate=2003-12-31", "dateregion=ocg", "misc=yes"} {
		if !strings.Contains(gotQuery, want) {
			t.Errorf("query %q não contém %q", gotQuery, want)
		}
	}

	cards := ToCards(raw)
	if len(cards) != 3 {
		t.Fatalf("len = %d, esperado 3", len(cards))
	}
	dm := cards[0]
	if dm.Name != "Dark Magician" || dm.ATK == nil || *dm.ATK != 2500 || dm.OCGDate != "1999-02-04" || dm.TCGDate != "2002-03-08" {
		t.Errorf("mapeamento incorreto: %+v", dm)
	}
	if dm.ImageFile != "cards/46986414.jpg" || dm.ImageSmallFile != "cards_small/46986414.jpg" {
		t.Errorf("caminhos de imagem: %q %q", dm.ImageFile, dm.ImageSmallFile)
	}
	if len(dm.Prints) != 1 || dm.Prints[0].SetCode != "LOB" || dm.Prints[0].PrintCode != "LOB-EN005" {
		t.Errorf("prints: %+v", dm.Prints)
	}
	if dm.IsExtraDeck {
		t.Error("Dark Magician não é do extra deck")
	}
	if !cards[1].IsExtraDeck {
		t.Error("Fusion Monster deve ser extra deck")
	}
	if cards[2].ATK != nil {
		t.Error("magia não deve ter ATK")
	}
}

func TestClientRetriesOnServerError(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&calls, 1) <= 2 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	if _, err := newTestClient(srv.URL).Cards(context.Background(), testEra); err != nil {
		t.Fatalf("esperava sucesso após retentativas: %v", err)
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Errorf("chamadas = %d, esperado 3", got)
	}
}

func TestClientDoesNotRetryOnRateLimit(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	_, err := newTestClient(srv.URL).Cards(context.Background(), testEra)
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("err = %v, esperado ErrRateLimited", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("chamadas = %d; 429 não deve ser repetido", got)
	}
}

func TestCardsSurfacesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"No card matching your query was found in the database."}`))
	}))
	defer srv.Close()

	_, err := newTestClient(srv.URL).Cards(context.Background(), testEra)
	if err == nil || !strings.Contains(err.Error(), "400") {
		t.Fatalf("err = %v, esperado erro HTTP 400", err)
	}
}

func TestDownloaderDownloadsSkipsAndCollectsFailures(t *testing.T) {
	api := fakeAPI(t)
	client := newTestClient(api.URL)
	raw, err := client.Cards(context.Background(), testEra)
	if err != nil {
		t.Fatal(err)
	}
	cards := ToCards(raw)

	dir := t.TempDir()
	d := &Downloader{Client: client, Dir: dir}

	res, err := d.Run(context.Background(), cards, 0, nil)
	if err != nil {
		t.Fatal(err)
	}
	// 3 cartas x 2 imagens = 6 arquivos; a imagem grande da Typhoon devolve 404.
	if res.Downloaded != 5 || len(res.Failed) != 1 || res.Skipped != 0 {
		t.Fatalf("1ª execução: %+v", res)
	}
	if _, err := os.Stat(filepath.Join(dir, "cards", "46986414.jpg")); err != nil {
		t.Errorf("imagem esperada não existe: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "cards", "5318639.jpg.part")); err == nil {
		t.Error("arquivo .part não deveria sobrar")
	}

	res, err = d.Run(context.Background(), cards, 0, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Downloaded != 0 || res.Skipped != 5 || len(res.Failed) != 1 {
		t.Fatalf("2ª execução (retomada): %+v", res)
	}
}

func TestDownloaderLimitAndProgress(t *testing.T) {
	api := fakeAPI(t)
	client := newTestClient(api.URL)
	raw, _ := client.Cards(context.Background(), testEra)
	cards := ToCards(raw)

	var last int
	d := &Downloader{Client: client, Dir: t.TempDir()}
	res, err := d.Run(context.Background(), cards, 1, func(done, total int) {
		last = done
		if total != 2 {
			t.Errorf("total = %d, esperado 2 (uma carta, duas imagens)", total)
		}
	})
	if err != nil || res.Downloaded != 2 || last != 2 {
		t.Fatalf("res=%+v err=%v last=%d", res, err, last)
	}
}

func TestDownloaderStopsOnRateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	cards := []Card{{ID: 1, ImageURL: srv.URL + "/a.jpg", ImageFile: "cards/1.jpg"}, {ID: 2, ImageURL: srv.URL + "/b.jpg", ImageFile: "cards/2.jpg"}}
	d := &Downloader{Client: newTestClient(srv.URL), Dir: t.TempDir()}
	_, err := d.Run(context.Background(), cards, 0, nil)
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("err = %v, esperado ErrRateLimited", err)
	}
}

func TestDownloaderRespectsContextCancel(t *testing.T) {
	api := fakeAPI(t)
	client := newTestClient(api.URL)
	raw, _ := client.Cards(context.Background(), testEra)
	cards := ToCards(raw)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	d := &Downloader{Client: client, Dir: t.TempDir(), Interval: time.Second}
	if _, err := d.Run(ctx, cards, 0, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, esperado context.Canceled", err)
	}
}

func TestBuildReport(t *testing.T) {
	cards := []Card{
		{Name: "Dark Magician", Type: "Normal Monster", OCGDate: "1999-02-04", Archetype: "Dark Magician"},
		{Name: "Blue-Eyes Ultimate Dragon", Type: "Fusion Monster", IsExtraDeck: true, OCGDate: "2000-07-13"},
		{Name: "Mystical Space Typhoon", Type: "Spell Card", OCGDate: "2002-05-23"},
		{Name: "Mirror Force", Type: "Trap Card", OCGDate: "2004-06-01"}, // fora da janela
		{Name: "Sem Data", Type: "Trap Card"},
	}
	r := BuildReport(cards, testEra)

	if r.Total != 5 || r.Monsters != 1 || r.ExtraDeck != 1 || r.Spells != 1 || r.Traps != 2 {
		t.Errorf("contagens: %+v", r)
	}
	if r.OutsideEra != 1 || r.MissingDates != 1 {
		t.Errorf("fora=%d sem data=%d", r.OutsideEra, r.MissingDates)
	}
	if !r.Landmarks["Dark Magician"] || r.Landmarks["Kuriboh"] {
		t.Errorf("landmarks: %+v", r.Landmarks)
	}
	if len(r.Warnings) < 3 {
		t.Errorf("esperava avisos de data fora, sem data e ausentes: %v", r.Warnings)
	}
	out := r.String()
	for _, want := range []string{"Total de cartas: 5", "[ok] Dark Magician", "[AUSENTE] Kuriboh"} {
		if !strings.Contains(out, want) {
			t.Errorf("relatório sem %q:\n%s", want, out)
		}
	}
}

func TestBuildReportEmptyWarns(t *testing.T) {
	r := BuildReport(nil, testEra)
	if len(r.Warnings) == 0 || !strings.Contains(fmt.Sprint(r.Warnings), "nenhuma carta") {
		t.Errorf("avisos: %v", r.Warnings)
	}
}

func TestWriteAndReadCardsFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "cards.json")
	in := CardsFile{GeneratedAt: time.Unix(0, 0).UTC(), Era: testEra, Cards: []Card{{ID: 1, Name: "X"}}}
	if err := WriteJSON(path, in); err != nil {
		t.Fatal(err)
	}
	out, err := ReadCardsFile(path)
	if err != nil || len(out.Cards) != 1 || out.Era != testEra {
		t.Fatalf("out=%+v err=%v", out, err)
	}
}
