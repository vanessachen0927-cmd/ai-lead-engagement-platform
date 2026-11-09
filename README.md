# AI Lead Engagement Platform (LeadFlow)

Portfolio full-stack system for lead intake, rule-based lead qualification, and follow-up scheduling. Designed to demonstrate **C# / ASP.NET Core 10, React + TypeScript, SQL (SQLite by default, optional SQL Server), Python, Docker, and GitHub Actions**.

> **Scope and honesty:** The Python scoring microservice is a deterministic demonstration, *not* a trained/hosted generative AI model. Follow-up scheduling stores records only; it does not send messages. This is not a production customer messaging product.

## Architecture

`React UI → ASP.NET Core REST API → EF Core → SQLite (optional SQL Server)`

`ASP.NET Core → Python FastAPI lead qualification service`

### Run with Docker

Requires Docker Engine / Desktop, including Docker Compose.

```bash
docker compose up --build
```

Open http://localhost:5173 for the dashboard, http://localhost:8080/swagger for the REST API, and http://localhost:8001/docs for the qualification API.

**Mac Apple Silicon:** The default uses SQLite and does *not* need SQL Server emulation. The optional SQL Server image is x86-64, can be slow or unsupported on arm64, and is for a separate demonstration; launching the `sqlserver` profile alone does not switch the API database provider. To switch, set `ConnectionStrings__SqlServer` on the API service to a SQL Server connection string and restart. Use proper credentials via local environment secrets.

### Local development without Docker

- .NET SDK 10: `cd backend/AspenLead.Api && dotnet run --urls http://localhost:8080`
- Python: `cd ai-service && pip install -r requirements.txt && uvicorn main:app --port 8001`
- Node.js 22: `cd frontend && npm install && npm run dev`

The backend uses `EnsureCreated` for a disposable demo database. Production should replace this with EF migrations, authentication/authorization, secret management, rate limiting, PII retention controls, audit policies, and reliable messaging queues.

### API requests

```bash
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/api/leads -H 'Content-Type: application/json' \
  -d '{"name":"Sample Client","email":"sample@example.com","source":"google","message":"I want pricing and a demo"}'
curl -s http://localhost:8080/api/leads
```

### Verify

```bash
pip install pytest httpx -r ai-service/requirements.txt
pytest -q ai-service/tests
cd frontend && npm install && npm run build
cd ../backend/AspenLead.Api && dotnet build
```

CI performs those checks on GitHub Actions. **No live email/SMS calls, advertising API credentials, or third-party lead data.**

### Future milestones

- Replace rules with a measured, privacy-aware LLM qualification service and evaluate precision/recall.
- Add authentication, EF migrations, API integration tests, background job retries/idempotency, CRM webhooks, and production monitoring.
