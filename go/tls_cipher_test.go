package tlscipher

import (
	"crypto/tls"
	"testing"
)

func TestNegotiateSuite_UnknownID(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	name, err := r.NegotiateSuite([]uint16{0xFFFF})
	if err == nil {
		t.Fatal("expected an error for an unknown suite")
	}
	if name != "" {
		t.Fatalf("expected empty suite name, got %q", name)
	}
}

func TestNegotiateSuite_ValidID(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	name, err := r.NegotiateSuite([]uint16{tls.TLS_AES_128_GCM_SHA256})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "TLS_AES_128_GCM_SHA256" {
		t.Fatalf("expected TLS_AES_128_GCM_SHA256, got %q", name)
	}
}
