package config

import "testing"

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestDefaults(t *testing.T) {
	cfg, err := parse(env(map[string]string{"METIS_ENGINE_URL": "http://localhost:8273"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Address != DefaultAddress || cfg.EngineURL.String() != "http://localhost:8273" {
		t.Fatalf("got %+v", cfg)
	}
}

func TestTheEngineMustBeNamed(t *testing.T) {
	if _, err := parse(env(nil)); err == nil {
		t.Fatal("started with no METIS_ENGINE_URL")
	}
}

func TestAddressIsRead(t *testing.T) {
	cfg, err := parse(env(map[string]string{"METIS_ENGINE_URL": "http://e:1", "METIS_SERVER_ADDRESS": ":9000"}))
	if err != nil || cfg.Address != ":9000" {
		t.Fatalf("got %+v, %v", cfg, err)
	}
}
