package apikey

import (
	"context"
	"errors"
	"sync"
	"time"
)

// memStore is a Store in memory, for tests.
type memStore struct {
	mu     sync.Mutex
	keys   map[string]Key    // by id
	hashes map[string]string // hash -> id
	fail   error
}

func newMemStore() *memStore {
	return &memStore{keys: map[string]Key{}, hashes: map[string]string{}}
}

func (m *memStore) Create(_ context.Context, key Key, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.keys[key.ID] = key
	m.hashes[hash] = key.ID
	return nil
}

func (m *memStore) ListByOrganization(_ context.Context, org string) ([]Key, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Key
	for _, k := range m.keys {
		if k.OrganizationID == org {
			out = append(out, k)
		}
	}
	return out, nil
}

func (m *memStore) GetUnrevokedByHash(_ context.Context, hash string) (Key, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fail != nil {
		return Key{}, m.fail
	}
	k, ok := m.keys[m.hashes[hash]]
	if !ok || k.RevokedAt != nil {
		return Key{}, ErrNotFound
	}
	return k, nil
}

func (m *memStore) Revoke(_ context.Context, org, id string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k, ok := m.keys[id]
	if !ok || k.OrganizationID != org {
		return ErrNotFound
	}
	k.RevokedAt = &at
	m.keys[id] = k
	return nil
}

func (m *memStore) MarkUsed(_ context.Context, id string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k, ok := m.keys[id]
	if !ok {
		return errors.New("no such key")
	}
	k.LastUsedAt = &at
	m.keys[id] = k
	return nil
}
