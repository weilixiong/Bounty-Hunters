import logging
import struct
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from tls_handshake import HandshakeMessage, HandshakeType, TLSHandshake  # noqa: E402


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
