package tlscipher

import (
	"crypto/tls"
	"testing"
)

func suiteIndex(suites []*CipherSuite, id uint16) int {
	for i, suite := range suites {
		if suite.ID == id {
			return i
		}
	}
	return -1
}

func TestSortByPreference_ARM64_PrefersChaCha20(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	r.goarch = "arm64"
	sorted := r.SortByPreference(r.FilterWeakSuites(r.knownSuites))
	chacha := suiteIndex(sorted, tls.TLS_CHACHA20_POLY1305_SHA256)
	aes128 := suiteIndex(sorted, tls.TLS_AES_128_GCM_SHA256)
	aes256 := suiteIndex(sorted, tls.TLS_AES_256_GCM_SHA384)
	if chacha == -1 || aes128 == -1 || aes256 == -1 {
		t.Fatalf("expected ChaCha20 and AES-GCM suites in sorted list")
	}
	if chacha > aes128 || chacha > aes256 {
		t.Fatalf("expected ChaCha20 before AES-GCM on arm64, got chacha=%d aes128=%d aes256=%d", chacha, aes128, aes256)
	}
}

func TestSortByPreference_AMD64_PrefersAEAD(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	r.goarch = "amd64"
	suites := []*CipherSuite{
		r.knownSuites[1], // AES-256-GCM
		r.knownSuites[2], // ChaCha20
	}
	sorted := r.SortByPreference(suites)
	if sorted[0].ID != tls.TLS_AES_256_GCM_SHA384 {
		t.Fatalf("expected amd64 ordering to leave AES-GCM ahead of ChaCha20, got %s", sorted[0].Name)
	}
}
