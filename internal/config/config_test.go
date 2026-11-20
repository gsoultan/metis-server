package config

import "testing"

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestAnEngineElsewhereIsProxied(t *testing.T) {
	cfg, err := parse(env(map[string]string{"METIS_ENGINE_URL": "http://localhost:8273"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Address != DefaultAddress || cfg.EngineURL.String() != "http://localhost:8273" || cfg.Embedded {
		t.Fatalf("got %+v", cfg)
	}
}

func TestWithNoEngineNamedItRunsInThisProcessOnLoopback(t *testing.T) {
	cfg, err := parse(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Embedded || cfg.EngineAddress != DefaultEmbeddedEngineAddress || cfg.EngineURL.String() != "http://127.0.0.1:8273" {
		t.Fatalf("got %+v", cfg)
	}
}

func TestTheEmbeddedEnginesAddressIsReachedOnLoopback(t *testing.T) {
	for listen, want := range map[string]string{
		":9001":          "http://127.0.0.1:9001",
		"0.0.0.0:9001":   "http://127.0.0.1:9001",
		"[::]:9001":      "http://127.0.0.1:9001",
		"10.0.0.5:9001":  "http://10.0.0.5:9001",
		"127.0.0.1:9001": "http://127.0.0.1:9001",
	} {
		cfg, err := parse(env(map[string]string{"METIS_HTTP_ADDRESS": listen}))
		if err != nil || cfg.EngineURL.String() != want || cfg.EngineAddress != listen {
			t.Errorf("%s: got %+v, %v; want %s", listen, cfg, err, want)
		}
	}
}

func TestABadEngineURLIsRefused(t *testing.T) {
	if _, err := parse(env(map[string]string{"METIS_ENGINE_URL": "ftp://e"})); err == nil {
		t.Fatal("accepted ftp://")
	}
}

func TestAddressIsRead(t *testing.T) {
	cfg, err := parse(env(map[string]string{"METIS_ENGINE_URL": "http://e:1", "METIS_SERVER_ADDRESS": ":9000"}))
	if err != nil || cfg.Address != ":9000" {
		t.Fatalf("got %+v, %v", cfg, err)
	}
}
