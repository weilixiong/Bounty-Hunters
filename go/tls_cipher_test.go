package tlscipher

import "testing"

func TestSortByPreference_AEADFirst(t *testing.T) {
	r := NewSuiteRegistry(StrengthWeak)
	nonAEAD := &CipherSuite{Name: "TLS_RSA_WITH_AES_128_CBC_SHA", KeySize: 128, IsAEAD: false, Strength: StrengthLegacy}
	aead := &CipherSuite{Name: "TLS_AES_128_GCM_SHA256", KeySize: 128, IsAEAD: true, Strength: StrengthModern}
	sorted := r.SortByPreference([]*CipherSuite{nonAEAD, aead})
	if sorted[0] != aead {
		t.Fatalf("expected AEAD suite first, got %s", sorted[0].Name)
	}
}
