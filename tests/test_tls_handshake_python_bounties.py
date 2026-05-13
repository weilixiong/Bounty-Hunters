import logging
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from tls_handshake import HandshakeMessage, HandshakeType, TLSHandshake, hmac  # noqa: E402


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

    assert handshake.verify_finished(expected, "server finished") is True
    assert calls == [(expected, expected)]


def test_process_key_exchange_returns_false_and_logs_expected_errors(caplog):
    handshake = TLSHandshake()
    message = HandshakeMessage(HandshakeType.CLIENT_KEY_EXCHANGE, b"\x00")

    with caplog.at_level(logging.WARNING):
        assert handshake.process_key_exchange(message) is False

    assert "Failed to process key exchange" in caplog.text


def test_process_key_exchange_propagates_unexpected_errors(monkeypatch):
    handshake = TLSHandshake()
    payload = struct.pack("!H", 48) + (b"x" * 48)
    message = HandshakeMessage(HandshakeType.CLIENT_KEY_EXCHANGE, payload)

    def raise_type_error(_encrypted):
        raise TypeError("unexpected bug")

    monkeypatch.setattr(handshake, "_decrypt_pre_master_secret", raise_type_error)

    with pytest.raises(TypeError, match="unexpected bug"):
        handshake.process_key_exchange(message)


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
