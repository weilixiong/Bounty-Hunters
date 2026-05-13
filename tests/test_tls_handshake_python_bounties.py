import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from tls_handshake import TLSHandshake  # noqa: E402


def test_derive_master_secret_uses_extended_master_secret_label(monkeypatch):
    labels = []

    def fake_prf(_secret, label, _seed, output_len):
        labels.append(label)
        return label.ljust(output_len, b"!")[:output_len]

    handshake = TLSHandshake()
    handshake._pre_master_secret = b"p" * 48
    handshake.client_random = b"c" * 32
    handshake.server_random = b"s" * 32
    monkeypatch.setattr(handshake, "_prf", fake_prf)

    handshake.negotiated_ems = False
    handshake._derive_master_secret()
    regular_secret = handshake.master_secret

    handshake.negotiated_ems = True
    handshake._derive_master_secret()
    ems_secret = handshake.master_secret

    assert labels == [b"master secret", b"extended master secret"]
    assert regular_secret != ems_secret
    assert len(regular_secret) == 48
    assert len(ems_secret) == 48
