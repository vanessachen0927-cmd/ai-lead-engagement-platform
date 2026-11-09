# Phase 4 Installation and Validation

This project extends Phase 3 with password-protected demo access, session cookies, login rate limiting, automated integration tests, and CI checks.

## Install without deleting saved leads

1. Download the Phase 4 ZIP to `~/Downloads`.
2. Run `unzip -o ai-lead-engagement-platform-phase4.zip -d phase4-new`.
3. Back up the current project directory.
4. Copy Phase 4 source and configuration files into the existing folder without replacing or deleting the Docker volume.
5. Create a `.env` containing your own random admin password.
6. Run `docker compose up -d --build`.

The existing volume `ai-lead-engagement-platform_lead_data` holds lead data. Do not run `docker compose down -v`.

## Mac install commands

```bash
cd ~/Downloads
unzip -o ai-lead-engagement-platform-phase4.zip -d phase4-new
cp -R ai-lead-engagement-platform ai-lead-engagement-platform-pre-phase4-backup
cp phase4-new/ai-lead-engagement-platform/backend/AspenLead.Api/Program.cs ai-lead-engagement-platform/backend/AspenLead.Api/Program.cs
cp phase4-new/ai-lead-engagement-platform/backend/AspenLead.Api/Models.cs ai-lead-engagement-platform/backend/AspenLead.Api/Models.cs
cp phase4-new/ai-lead-engagement-platform/frontend/src/main.tsx ai-lead-engagement-platform/frontend/src/main.tsx
cp phase4-new/ai-lead-engagement-platform/frontend/src/style.css ai-lead-engagement-platform/frontend/src/style.css
cp phase4-new/ai-lead-engagement-platform/frontend/vite.config.ts ai-lead-engagement-platform/frontend/vite.config.ts
cp phase4-new/ai-lead-engagement-platform/compose.yaml ai-lead-engagement-platform/compose.yaml
mkdir -p ai-lead-engagement-platform/tests ai-lead-engagement-platform/.github/workflows
cp phase4-new/ai-lead-engagement-platform/tests/test_end_to_end.py ai-lead-engagement-platform/tests/test_end_to_end.py
cp phase4-new/ai-lead-engagement-platform/.github/workflows/ci.yml ai-lead-engagement-platform/.github/workflows/ci.yml
cd ai-lead-engagement-platform
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
chmod 600 .env
cat .env

docker compose up -d --build
docker compose ps
set -a
source .env
set +a
python3 -m unittest discover -s tests -v
```

Use the password printed by `cat .env` to sign in at http://localhost:5173. Do not commit or share `.env`.

## Security and operational limits

This is a local portfolio demo, not an audited production deployment. The single admin password grants full access to all leads. There is no multi-user account management, password reset, audit event stream, HTTPS termination, distributed rate limiting, or production secrets manager. The frontend uses same-origin reverse proxying, with HttpOnly SameSite=Strict cookies for sessions. Public deployment requires TLS, persistent Data Protection keys, reverse-proxy hardening, EF Core migrations, proper account management, and security review. The deterministic Python suggestion service is not a generative LLM. Outbound messages remain unsent drafts.

The `/health` endpoint is intentionally public. Lead endpoints require authentication. Python is only exposed inside the Compose network.
