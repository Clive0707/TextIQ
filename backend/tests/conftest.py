import os
import random
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="textiq-test-")
os.environ["TEXTIQ_STORAGE_ROOT"] = _TMP
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

VOCAB = {
    "space": "orbit rocket nasa launch satellite moon planet shuttle astronaut telescope galaxy mission".split(),
    "autos": "engine car brake tire dealer sedan transmission mileage horsepower wheel clutch gearbox".split(),
    "medicine": "doctor patient disease treatment clinical symptoms vaccine diagnosis therapy hospital dose infection".split(),
}
FILLER = "the a and of to in is it that this with for on was".split()


def make_rows(n_per_class=60, seed=0):
    rng = random.Random(seed)
    rows = []
    for label, words in VOCAB.items():
        for _ in range(n_per_class):
            tokens = [rng.choice(words) for _ in range(12)] + [rng.choice(FILLER) for _ in range(8)]
            rng.shuffle(tokens)
            rows.append((" ".join(tokens).capitalize() + ".", label))
    rng.shuffle(rows)
    return rows


@pytest.fixture(scope="session")
def csv_bytes():
    lines = ["body,topic,extra"]
    for text, label in make_rows():
        lines.append(f'"{text}",{label},x')
    lines.append(',space,x')  # empty text row — must be skipped, not crash
    return ("\n".join(lines) + "\n").encode()


@pytest.fixture(scope="session")
def app():
    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture()
def client(app):
    return app.test_client()
