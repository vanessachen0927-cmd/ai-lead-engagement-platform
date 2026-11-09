import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_high_intent():
    r = client.post("/qualify", json={"message": "I need a demo and pricing for a quote", "source": "web"})
    assert r.status_code == 200
    assert r.json()["score"] >= 60

def test_low_intent():
    r = client.post("/qualify", json={"message": "hello", "source": "web"})
    assert r.json()["score"] == 20

def test_score_cap():
    r = client.post("/qualify", json={"message": "quote pricing demo appointment buy urgent interested"})
    assert r.json()["score"] == 100

def test_validation():
    assert client.post("/qualify", json={"message": "x" * 5001}).status_code == 422
