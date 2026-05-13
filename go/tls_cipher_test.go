package tlscipher

import "testing"

func TestFilterWeakSuites_RemovesRC4(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	filtered := r.FilterWeakSuites([]*CipherSuite{
		{ID: 0xCC13, Name: "TLS_RSA_WITH_RC4_128_SHA", KeySize: 128},
	})
	if len(filtered) != 0 {
		t.Fatalf("expected RC4 suite to be filtered, got %d suites", len(filtered))
	}
}

func TestFilterWeakSuites_KeepsAES(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	aes := &CipherSuite{ID: 0x1301, Name: "TLS_AES_128_GCM_SHA256", KeySize: 128}
	filtered := r.FilterWeakSuites([]*CipherSuite{aes})
	if len(filtered) != 1 || filtered[0] != aes {
		t.Fatalf("expected AES suite to be kept, got %#v", filtered)
	}
}
