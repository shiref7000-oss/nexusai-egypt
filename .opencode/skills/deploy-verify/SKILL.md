---
name: deploy-verify
description: Use when preparing to deploy or verifying a deployment. Runs the full deployment safety checklist: PM2 status, API health, n8n health, database connectivity, firewall status, disk/memory, and migration status.
---

# Deploy Verification Skill

Verify production readiness before deploying changes.

## Verification Steps

1. **PM2 status:** `pm2 list` — all processes online, no crash loops.
2. **API health:** `curl http://localhost:3001/health/runtime` — HTTP 200.
3. **Worker health:** `curl http://localhost:3002/health` — HTTP 200.
4. **n8n health:** `docker inspect n8n-n8n-1 --format='{{.State.Health.Status}}'` — healthy.
5. **Database:** `su - postgres -c 'psql -d nexusai -c "SELECT 1"'` — returns 1.
6. **Redis:** `redis-cli ping` — PONG (or check via API health response).
7. **Firewall:** `ufw status` — active.
8. **Disk:** `df -h /` — >20% free.
9. **Memory:** `free -h` — >500MB available.
10. **Migrations:** Check `schema_migrations` table for pending migrations.

## Rules

- Run ALL checks — do not skip any.
- Report failures immediately with the exact error.
- Do not proceed with deployment if any check fails.
- If going through a jump host, run commands on the VPS via SSH.
