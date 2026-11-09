# Phase 2 — Lead Management Dashboard

Target role: Aspen AI — Founding Software Engineer.

## Added

- Lead search and source/status filters
- Sort by score and creation date
- Conversion pipeline and statistics
- Lead details, qualification reason and follow-up history
- Lead status updates using `PATCH /api/leads/{id}/status`
- Follow-up scheduling with future-time validation
- Responsive React/TypeScript dashboard

## Updating your Mac project

1. Preserve your existing `~/Downloads/ai-lead-engagement-platform` folder and Docker volume.
2. Extract this zip elsewhere first, such as `~/Downloads/phase2-new/`.
3. Copy the **contents** of the new `frontend/src` to your existing `frontend/src`.
4. Copy the new `backend/AspenLead.Api/Program.cs` and `Models.cs` to your existing equivalent paths.
5. From your existing project root, run `docker compose up -d --build`.
6. Open http://localhost:5173 and test status changes and follow-up schedules.

Do not run `docker compose down -v`: that would remove the persisted lead database.

## Test API status update

```bash
curl -i -X PATCH http://localhost:8080/api/leads/1/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"contacted"}'
```

Valid statuses: `new`, `qualified`, `contacted`, `converted`, `lost`.

## Notes

This remains a portfolio demo, not a production deployment. Lead scoring is rule-based, and scheduled follow-ups are stored but do not send emails or SMS. SQLite sorting is performed in memory for the demo.

The new frontend and backend changes have not been built in this environment; run the Docker build and verify endpoints on your Mac.
