"""Upload handling: extension allow-list, filename sanitising, server-generated storage names."""
import re
import uuid
from pathlib import Path

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from config import ALLOWED_UPLOAD_EXTENSIONS
from .responses import ApiError


def display_filename(original: str | None) -> str:
    """A safe name for display only; files are never stored under user-supplied names."""
    name = secure_filename(original or "") or "upload.csv"
    return name[:120]


def require_csv(file: FileStorage | None) -> str:
    if file is None or not file.filename:
        raise ApiError("Choose a CSV file to upload.", code="missing_file")
    name = display_filename(file.filename)
    if Path(name).suffix.lower() not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ApiError("Only .csv files are supported.", code="unsupported_file_type")
    return name


def save_upload(file: FileStorage, directory: Path) -> tuple[str, Path]:
    """Stores the upload under a random id and returns (id, path)."""
    token = uuid.uuid4().hex
    path = directory / f"{token}.csv"
    file.save(path)
    if path.stat().st_size == 0:
        path.unlink(missing_ok=True)
        raise ApiError("The uploaded file is empty.", code="empty_file")
    return token, path


TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")


def resolve_token(token: str, directory: Path) -> Path:
    """Maps a client-provided id back to a stored file without allowing path traversal."""
    if not isinstance(token, str) or not TOKEN_RE.match(token):
        raise ApiError("Unknown upload id.", code="invalid_upload")
    path = directory / f"{token}.csv"
    if not path.exists():
        raise ApiError("That upload has expired or was removed. Upload the file again.", code="upload_missing", status=404)
    return path
