package tlscipher

import (
	"crypto/tls"
	"testing"
)

func TestConcurrentLookup(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	ids := make([]uint16, 100)
	for i := range ids {
		ids[i] = tls.TLS_AES_128_GCM_SHA256
	}
	results, err := r.ConcurrentLookup(ids)
	if err != nil {
		t.Fatalf("ConcurrentLookup returned error: %v", err)
	}
	for i, suite := range results {
		if suite == nil || suite.ID != tls.TLS_AES_128_GCM_SHA256 {
			t.Fatalf("result %d = %#v, want TLS_AES_128_GCM_SHA256", i, suite)
		}
	}
}

func TestLookupSuite_Cached(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	first := r.lookupSuite(tls.TLS_AES_128_GCM_SHA256)
	second := r.lookupSuite(tls.TLS_AES_128_GCM_SHA256)
	if first == nil || second == nil {
		t.Fatal("expected cached suite lookups to return a suite")
	}
	if first != second {
		t.Fatal("expected repeated lookups to return the cached suite pointer")
	}
}
