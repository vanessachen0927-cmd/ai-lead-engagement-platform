# Phase 3 — Conversation and follow-up automation

Target role: Aspen AI Founding Software Engineer.

This is a portfolio demonstration. Response suggestions use deterministic templates, not a generative language model. Outbound messages are drafts only. Follow-ups are saved records only; no email, SMS, phone call, or other external communication occurs.

## Safely install over existing Phase 2

Preserve your working project's Docker volume. Do not run `docker compose down -v`.

1. Unzip `ai-lead-engagement-platform-phase3.zip` in `~/Downloads/phase3-new`.
2. Copy **only these five files** from its nested `ai-lead-engagement-platform` directory into your existing project at `~/Downloads/ai-lead-engagement-platform`:
   - `backend/AspenLead.Api/Program.cs`
   - `backend/AspenLead.Api/Models.cs`
   - `ai-service/main.py`
   - `frontend/src/main.tsx`
   - `frontend/src/style.css`
3. Run `docker compose up -d --build` from the existing project folder.
4. Check `docker compose ps` and `curl -i http://localhost:8080/health`.
5. In the dashboard, open an existing lead under Details. Record an inbound message, generate a suggested reply, save it as an outbound draft, preview a follow-up rule, and explicitly apply the rule.

## New endpoints

- `GET /api/leads/{id}/messages` — List stored messages
- `POST /api/leads/{id}/messages` — Record an inbound message or unsent outbound draft
- `POST /api/leads/{id}/suggest` — Get deterministic contextual template
- `POST /api/leads/{id}/automation/preview` — Preview a follow-up
- `POST /api/leads/{id}/automation/apply` — Explicitly create a scheduled follow-up

Existing SQLite data is preserved. Startup creates the new `ConversationMessages` table when missing. Existing database schema is otherwise untouched. A production deployment should use formal EF Core migrations instead.

## Tests

`docker compose exec ai python -m pytest -q tests` requires pytest to be installed in the image. Otherwise run locally in a Python environment with `fastapi`, `pydantic`, and `pytest`: `PYTHONPATH=ai-service python -m pytest -q ai-service/tests`.

The frontend can be verified with `docker compose build frontend`. A full test requires checking the dashboard and each API workflow on your Mac.
