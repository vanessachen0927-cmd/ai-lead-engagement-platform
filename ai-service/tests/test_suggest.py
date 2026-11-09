import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import SuggestRequest, HistoryMessage, suggest


def test_suggestion_uses_latest_inbound_message():
    result = suggest(SuggestRequest(name="Alex Johnson", status="new", score=35,
        message="Hello", history=[HistoryMessage(direction="inbound", body="I need a quote"),
            HistoryMessage(direction="outbound", body="Draft")]))
    assert "budget" in result.suggestion.lower()
    assert result.mode == "template"


def test_suggestion_for_consultation():
    result = suggest(SuggestRequest(name="Sam Patel", status="new", score=55,
        message="Please schedule a consultation"))
    assert "consultation" in result.suggestion.lower()


def test_suggestion_for_existing_contact():
    result = suggest(SuggestRequest(name="Tanya", status="contacted", score=25, message="Hi"))
    assert "checking" in result.suggestion.lower()
