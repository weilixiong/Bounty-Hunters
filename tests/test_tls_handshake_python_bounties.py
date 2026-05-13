import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from tls_handshake import TLSHandshake, hmac  # noqa: E402
import pytest


def test_verify_finished_uses_constant_time_compare(monkeypatch):
    handshake = TLSHandshake()
    handshake.master_secret = b"m" * 48
    expected = handshake._prf(
        handshake.master_secret,
        b"server finished",
        handshake.handshake_hash.copy().digest(),
        12,
    )
    calls = []

    def fake_compare_digest(left, right):
        calls.append((left, right))
        return True

    monkeypatch.setattr(hmac, "compare_digest", fake_compare_digest)

    result = handshake.verify_finished(expected, "server finished")
    assert result is True
    assert calls == [(expected, expected)]
