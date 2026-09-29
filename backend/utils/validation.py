"""Small helpers for validating JSON request bodies."""
from flask import request

from .responses import ApiError


def json_body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("The request body must be a JSON object.", code="invalid_body")
    return body


def get_int(body: dict, key: str, *, required: bool = True, default=None, lo=None, hi=None) -> int | None:
    value = body.get(key, default)
    if value is None:
        if required:
            raise ApiError(f"'{key}' is required.", code="missing_field")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value:
        raise ApiError(f"'{key}' must be a whole number.", code="invalid_field")
    value = int(value)
    if (lo is not None and value < lo) or (hi is not None and value > hi):
        raise ApiError(f"'{key}' must be between {lo} and {hi}.", code="invalid_field")
    return value


def get_float(body: dict, key: str, *, default=None, lo=None, hi=None) -> float:
    value = body.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(f"'{key}' must be a number.", code="invalid_field")
    value = float(value)
    if (lo is not None and value < lo) or (hi is not None and value > hi):
        raise ApiError(f"'{key}' must be between {lo} and {hi}.", code="invalid_field")
    return value


def get_str(body: dict, key: str, *, required: bool = True, max_len: int = 200) -> str | None:
    value = body.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ApiError(f"'{key}' is required.", code="missing_field")
        return None
    if not isinstance(value, str):
        raise ApiError(f"'{key}' must be text.", code="invalid_field")
    if len(value) > max_len:
        raise ApiError(f"'{key}' is too long (max {max_len} characters).", code="invalid_field")
    return value.strip()


def get_bool(body: dict, key: str, default: bool) -> bool:
    value = body.get(key, default)
    if not isinstance(value, bool):
        raise ApiError(f"'{key}' must be true or false.", code="invalid_field")
    return value
