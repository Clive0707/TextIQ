"""Uniform JSON envelopes: {"ok": true, "data": ...} or {"ok": false, "error": {...}}."""
from flask import jsonify


class ApiError(Exception):
    """Raised anywhere in request handling; converted to a clean JSON error response."""

    def __init__(self, message: str, code: str = "bad_request", status: int = 400, details: list[str] | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.details = details or []


def ok(data, status: int = 200):
    return jsonify({"ok": True, "data": data}), status


def fail(message: str, code: str = "bad_request", status: int = 400, details: list[str] | None = None):
    error = {"code": code, "message": message}
    if details:
        error["details"] = details
    return jsonify({"ok": False, "error": error}), status


def not_found(what: str) -> ApiError:
    return ApiError(f"{what} was not found.", code="not_found", status=404)
