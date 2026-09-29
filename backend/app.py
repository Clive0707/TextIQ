"""TextIQ Flask application."""
import logging
import sys
from pathlib import Path

# Allow `python backend/app.py` from the project root as well as from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from flask import Flask, send_from_directory  # noqa: E402
from werkzeug.exceptions import HTTPException  # noqa: E402

import db  # noqa: E402
from config import FRONTEND_DIST, MAX_UPLOAD_BYTES, ensure_dirs  # noqa: E402
from routes import analytics, batch, classify, datasets, models, reports, system  # noqa: E402
from utils.responses import ApiError, fail  # noqa: E402

log = logging.getLogger("textiq")


def create_app() -> Flask:
    ensure_dirs()
    db.init_db()
    from services.repository import ensure_deployed

    ensure_deployed()

    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
    app.json.sort_keys = False

    for module in (system, datasets, models, classify, batch, analytics, reports):
        app.register_blueprint(module.bp)

    @app.errorhandler(ApiError)
    def handle_api_error(e: ApiError):
        return fail(e.message, e.code, e.status, e.details)

    @app.errorhandler(HTTPException)
    def handle_http(e: HTTPException):
        if e.code == 413:
            return fail(f"The file is too large. The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.", "file_too_large", 413)
        if e.code == 404:
            return fail("This endpoint does not exist.", "not_found", 404)
        if e.code == 405:
            return fail("This method is not allowed for this endpoint.", "method_not_allowed", 405)
        return fail(e.description or "Request failed.", "http_error", e.code or 500)

    @app.errorhandler(Exception)
    def handle_unexpected(e: Exception):
        log.exception("Unhandled error")  # full trace stays in the server log only
        return fail("Something went wrong on the server. Please try again.", "internal_error", 500)

    # Serve the built frontend (npm run build) so a single process can run the app.
    if FRONTEND_DIST.exists():

        @app.get("/", defaults={"path": ""})
        @app.get("/<path:path>")
        def spa(path: str):
            if path.startswith("api/"):
                return fail("This endpoint does not exist.", "not_found", 404)
            target = FRONTEND_DIST / path
            if path and target.is_file():
                return send_from_directory(FRONTEND_DIST, path)
            return send_from_directory(FRONTEND_DIST, "index.html")

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    create_app().run(host="127.0.0.1", port=5000, debug=False, threaded=True)
