from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Lead Qualification Service", version="0.1.0")

class LeadText(BaseModel):
    message: str = Field(default="", max_length=5000)
    source: str = Field(default="website", max_length=80)

class Score(BaseModel):
    score: int
    reason: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/qualify", response_model=Score)
def qualify(payload: LeadText):
    message = payload.message.lower()
    weights = {"quote": 25, "pricing": 25, "demo": 30, "appointment": 20,
               "buy": 25, "urgent": 10, "interested": 15}
    matching = [word for word in weights if word in message]
    score = min(100, 20 + sum(weights[word] for word in matching))
    return Score(score=score, reason=("Matched intent: " + ", ".join(matching)) if matching else "No strong buying intent detected")

class HistoryMessage(BaseModel):
    direction: str = Field(max_length=20)
    body: str = Field(max_length=5000)

class SuggestRequest(BaseModel):
    name: str = Field(max_length=160)
    status: str = Field(max_length=30)
    score: int = Field(ge=0, le=100)
    message: str = Field(default="", max_length=5000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=6)

class SuggestResponse(BaseModel):
    suggestion: str
    reason: str
    mode: str = "template"

@app.post("/suggest", response_model=SuggestResponse)
def suggest(payload: SuggestRequest):
    latest_inbound = next((item.body for item in reversed(payload.history) if item.direction == "inbound"), payload.message)
    inquiry = latest_inbound.lower()
    first_name = payload.name.strip().split()[0] if payload.name.strip() else "there"
    if "price" in inquiry or "quote" in inquiry or "cost" in inquiry:
        body = f"Hi {first_name}, thanks for reaching out. Could you share your budget and requirements so we can prepare a relevant estimate?"
        reason = "Pricing intent detected in the latest inbound message"
    elif "demo" in inquiry or "meeting" in inquiry or "consult" in inquiry or "schedule" in inquiry:
        body = f"Hi {first_name}, thanks for your interest. Would you like to share a convenient time for a short consultation?"
        reason = "Scheduling intent detected in the latest inbound message"
    elif payload.status == "contacted":
        body = f"Hi {first_name}, just checking whether you had any questions about our services. Happy to help whenever convenient."
        reason = "Lead has already been contacted"
    else:
        body = f"Hi {first_name}, thanks for reaching out. Could you tell us a bit more about what you're looking for?"
        reason = "General qualification response"
    return SuggestResponse(suggestion=body, reason=reason)
