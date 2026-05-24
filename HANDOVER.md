# NexusAI Platform — Disaster Recovery Handover

**Date:** 2026-05-24  
**Branch:** `handover/p0-disaster-recovery`  
**Commit:** `80d31007639971269d3579625a97103cee09af5b`  
**GitHub:** https://github.com/shiref7000-oss/nexusai-egypt

---

## 1. Infrastructure Inventory

| Resource | Detail |
|---|---|
| **VPS** | `178.16.129.216` (Hostinger, hostname: `srv1680265`) |
| **OS** | Ubuntu 24.04.4 LTS, Kernel 6.8.0-111 |
| **Disk** | 96 GB (10.2% used, ~87 GB free) |
| **Domain** | `nexus-ai.group` + `www.nexus-ai.group` |
| **SSL** | Let's Encrypt via certbot — valid until **2026-08-16** (84 days) |
| **SSH** | Port 22, root user, password auth |
| **Firewall** | UFW **inactive** (⚠️) |
| **Cron** | None configured (⚠️ no automated backups, no cert renewal cron) |

### Running Services

| Service | Version | Status | Notes |
|---|---|---|---|
| **Node.js** | v20.20.2 | — | Global |
| **PM2** | 7.0.1 | — | Process manager |
| **PostgreSQL** | 16.14 | Running | `nexusai` database at `127.0.0.1:5432` |
| **nginx** | 1.24.0 | Running | Reverse proxy at `/etc/nginx/sites-enabled/nexusai-saas` |
| **n8n** | Docker | `unhealthy` (⚠️) | Container `n8n-n8n-1`, up 4 days |
| **Redis** | Docker | `healthy` | Container `n8n-redis-1`, at `127.0.0.1:6379` |

### PM2 Applications

| Name | PID | Uptime | Restarts | Memory | Status |
|---|---|---|---|---|---|
| `nexusai-api` | 1549493 | 2h | **362** (⚠️) | 141 MB | online |
| `nexusai-saas` | 228338 | 4d | 6 | 103 MB | online |
| `nexusai-worker` | 1549505 | 2h | 43 | 77 MB | online |

### Docker Containers

| Name | Status | Uptime |
|---|---|---|
| `n8n-n8n-1` | Up 4d (unhealthy) | ⚠️ |
| `n8n-redis-1` | Up 5d (healthy) | ✅ |

---

## 2. File Paths

### App Directories

| Path | Purpose | Git? |
|---|---|---|
| `/var/www/nexusai-repo` | Source repository (git) | ✅ `handover/p0-disaster-recovery` |
| `/var/www/nexusai-api` | API deployment (PM2) | ❌ |
| `/var/www/nexusai-frontend` | Frontend deployment (PM2) | ❌ |
| `/opt/n8n` | n8n Docker compose + workflows | ❌ |
| `/opt/nexusai-saas` | Legacy saas build | ❌ |

### Configuration Files

| File | Purpose |
|---|---|
| `/etc/nginx/sites-enabled/nexusai-saas` | Reverse proxy configuration |
| `/var/www/nexusai-repo/.env.example` | Environment variable template (safe) |
| `/var/www/nexusai-repo/backend/express/.env.example` | Backend env template (safe) |
| `/var/www/nexusai-repo/saas-frontend/.env.production` | Frontend API URL (safe: `VITE_API_URL=`) |
| `/opt/n8n/workflows/*.json` | n8n workflow exports (contains secrets ⚠️) |

---

## 3. Repository Structure

```
nexusai-egypt/
├── backend/express/           # Express API server
│   ├── config/                # DB, env, logger, mockStore, workflows
│   ├── db/migrations/          # 29 SQL migrations (001–029)
│   ├── middleware/             # Auth, rate limit, usage, audit
│   ├── routes/                # API routes (admin, agents, ai, orders, etc.)
│   ├── src/                   # Source (engineering agent services)
│   │   ├── db/migrations/     # 29 migrations (duplicate set)
│   │   ├── routes/            # Route implementations
│   │   ├── services/          # ~100 service modules
│   │   │   ├── engineeringAgent/  # 50+ modules (AI-driven dev agent)
│   │   │   ├── aiProviders/       # Groq, Gemini, OpenAI, OpenRouter
│   │   │   ├── whatsapp/          # WhatsApp Cloud API integration
│   │   │   ├── costAnalyzer/      # AI cost analysis pipeline
│   │   │   ├── metaAds/           # Meta Ads integration
│   │   │   ├── adsIntelligence/   # Ad analytics & rules
│   │   │   └── ...                # orders, integrations, queue, etc.
│   │   └── server.ts
│   ├── ecosystem.config.cjs   # PM2 config
│   └── package.json
├── saas-frontend/             # React + Vite + Tailwind SaaS UI
│   ├── src/pages/             # 30+ pages (admin, agents, WhatsApp, etc.)
│   │   └── admin/             # 11 admin pages
│   ├── src/components/        # UI components (shadcn/ui)
│   ├── src/lib/               # API client modules (~20)
│   └── public/legacy/         # Legacy AI platform assets
├── n8n-workflows/             # n8n workflow exports (5 JSON files)
├── deploy/hotfixes/           # Deploy scripts & hotfixes
├── docs/                      # Engineering agent docs
├── src/                       # Vite frontend (Agents, Dashboard, etc.)
├── package.json               # Vite + React frontend
├── .env.example               # Environment template
└── .gitignore
```

---

## 4. n8n Workflow Inventory

| Workflow | ID | Webhook Path | Category |
|---|---|---|---|
| Analytics Agent | `93a95621-...44201` | `analytics-agent` | Analytics |
| Ads Creative Agent | `e46f8010-...a7a14` | `ads-creative-agent` | Automation |
| Customer Support Agent | `07cfcc14-...cd5e` | `customer-support-agent` | WhatsApp / Support |
| Order Confirmation Agent | `d5957ebd-...b28b09` | `order-confirmation-agent` | WhatsApp / Orders |
| Shipping Tracking Agent | `9ea70128-...8f62f0` | `shipping-tracking-agent` | WhatsApp / Orders |

- **n8n base URL (internal):** `http://127.0.0.1:5678`
- **Public webhooks:** `https://nexus-ai.group/webhook/{path}` (nginx proxy)
- **Exports:** `/opt/n8n/workflows/all-workflows.json` + individual files
- **Config:** `/opt/n8n/docker-compose.yml`
- ⚠️ Workflow JSON contains hardcoded API keys (Groq, Gemini) — **rotate immediately**

---

## 5. Backups (on VPS)

**Location:** `/root/nexusai-handover-backup/`

| File | Size | SHA-256 |
|---|---|---|
| `nexusai-repo-full-20260524-010840.tar.gz` | 2.9 MB | `69e2375a...` |
| `nexusai-api-deploy-20260524-010840.tar.gz` | 1.9 MB | `9f7c5063...` |
| `nexusai-frontend-deploy-20260524-010840.tar.gz` | 3.2 MB | `ad42403a...` |
| `n8n-workflows-20260524-010840.tar.gz` | 4.7 KB | `e6651fb3...` |
| `nexusai-schema-20260524-010840.sql` | 199 KB | `b8384247...` |
| `SHA256SUMS.txt` | — | Full checksum manifest |

Full SHA256 sums in `/root/nexusai-handover-backup/SHA256SUMS.txt`.

---

## 6. Database

- **Database:** `nexusai` on PostgreSQL 16.14
- **Migrations:** 29 SQL files (001–029)
- ⚠️ Duplicate migration: `029_engineering_agent_verification.sql` vs `029_google_sheets_whatsapp_automation.sql` (in separate `backend/express/db/migrations/` and `backend/express/src/db/migrations/`)
- **Schema backup:** `/root/nexusai-handover-backup/nexusai-schema-20260524-010840.sql` (199 KB)
- No row data backups exist — **needs nightly pg_dump**

---

## 7. API Endpoints (Summary)

| Prefix | Purpose |
|---|---|
| `/api/auth` | Authentication |
| `/api/admin` | Admin dashboard, users, system report |
| `/api/agents` | AI agents management |
| `/api/ai` | AI chat/providers |
| `/api/orders` | Order management |
| `/api/public/orders` | Public order submission |
| `/api/webhooks` | Incoming webhooks |
| `/api/integrations` | Third-party integrations |
| `/api/analytics` | Platform analytics |
| `/api/workflows` | n8n workflow management |
| `/api/engineering-agent` | Engineering agent control |
| `/api/whatsapp` | WhatsApp Cloud API |
| `/api/cost-analyzer` | Cost analysis operations |
| `/api/meta-ads` | Meta Ads integration |
| `/api/tiktok-ads` | TikTok Ads integration |
| `/api/ads-hub` | Ad platform hub |
| `/api/account` | User account management |
| `/api/queue` | Task queue status |
| `/api/usage` | Usage tracking |
| `/api/business-context` | Business context/embeddings |

---

## 8. Engineering Agent (AI Developer)

Located in `backend/express/src/services/engineeringAgent/` (50+ modules):

| Module | Purpose |
|---|---|
| `planner.ts` | Plan task decomposition |
| `runner.ts` | Execute code changes |
| `executionPipeline.ts` | Full pipeline orchestration |
| `verificationPipeline.ts` | Test & verify changes |
| `riskEngine.ts` | Risk assessment per file |
| `riskApproval.ts` | Approval workflow |
| `deploymentService.ts` | Deploy after verification |
| `branchIsolation.ts` | Git branch management |
| `codeReviewEngine.ts` | PR-style code review |
| `bundleVerification.ts` | Frontend build verification |
| `browserVerification.ts` | E2E browser tests |
| `modelRouter.ts` | AI model selection |
| `taskMonitor.ts` | Live task tracking |
| `aiTelemetry.ts` | AI decision telemetry |
| `engineeringScorecard.ts` | Performance scoring |
| + 30+ more | Tooling, memory, metrics, etc. |

⚠️ `ENGINEERING_DEPLOY_DRY_RUN` should remain `true` until a human operator is trained.

---

## 9. Required Credentials

| Credential | Where Used | Status |
|---|---|---|
| Groq API Key | n8n workflows, Express AI providers | ⚠️ Hardcoded in `/opt/n8n/workflows/*.json` — rotate |
| Gemini API Key | n8n workflows, Express AI providers | ⚠️ Hardcoded in `/opt/n8n/workflows/*.json` — rotate |
| GitHub PAT | Git push operations | Configured for this session only |
| n8n API Key | Express → n8n communication | In VPS env, retrieve from n8n UI |
| PostgreSQL credentials | DB connection | In production `.env` |
| WhatsApp Cloud API key | WhatsApp integration | In production `.env` |
| Meta Ads token | Meta Ads integration | In production `.env` |

**Production `.env` is NOT in the repository.** It must be copied from the VPS via secure channel.

---

## 10. Risks & Critical Items

| # | Risk | Severity | Action |
|---|---|---|---|
| 1 | n8n workflows contain hardcoded API keys | 🔴 Critical | Rotate Groq + Gemini keys immediately |
| 2 | `nexusai-api` has 362 PM2 restarts | 🟡 High | Investigate crash loop, check logs |
| 3 | n8n container is `unhealthy` | 🟡 High | Check `docker logs n8n-n8n-1` |
| 4 | No firewall (UFW inactive) | 🟡 High | Enable UFW, allow only 22, 80, 443 |
| 5 | No automated backups | 🟡 High | Set up nightly pg_dump + off-site sync |
| 6 | No cron jobs configured | 🟡 Medium | Add SSL renewal, DB backups, health checks |
| 7 | Duplicate migration 029 | 🟡 Medium | Resolve conflict between `backend/express/db/migrations/` and `backend/express/src/db/migrations/` |
| 8 | `nexusai-worker` has 43 restarts | 🟡 Medium | Check worker stability |
| 9 | `ENGINEERING_DEPLOY_DRY_RUN` | 🟢 Info | Keep `true` until trained |
| 10 | SSL expires in 84 days | 🟢 Info | certbot should auto-renew, verify |

---

## 11. New Engineer Onboarding

### Quick Start

```bash
# 1. Clone
git clone -b handover/p0-disaster-recovery https://github.com/shiref7000-oss/nexusai-egypt.git
cd nexusai-egypt

# 2. Install frontend
npm install

# 3. Install backend
cd backend/express && npm install

# 4. Restore DB schema (from backup)
psql -U postgres -d nexusai < /path/to/nexusai-schema-*.sql

# 5. Configure environment
cp .env.example .env          # Frontend
cp backend/express/.env.example backend/express/.env  # Backend
# Fill in all variables from production .env

# 6. Import n8n workflows
# In n8n UI: Settings → Import → n8n-workflows/all-workflows.json

# 7. Start dev
npm run dev                    # Frontend (Vite :5173)
cd backend/express && npx tsx server.ts  # Backend (:3001)
```

### Required Environment Variables

See `.env.example` and `backend/express/.env.example` for full list. Critical ones:
- `DATABASE_URL` — PostgreSQL connection string
- `GROQ_API_KEY` — Groq AI provider
- `GEMINI_API_KEY` — Gemini AI provider  
- `JWT_SECRET` — Auth token signing
- `N8N_API_URL` + `N8N_API_KEY` — n8n integration
- `WHATSAPP_*` — WhatsApp Cloud API
- `REDIS_URL` — Redis connection
- `ENCRYPTION_KEY` — Data encryption

---

## 12. Git Branches

| Branch | Commit | Purpose |
|---|---|---|
| `main` | `e1bb751` | Production (original shell) |
| `handover/p0-disaster-recovery` | `80d3100` | Full disaster recovery package |

After review: merge `handover/p0-disaster-recovery` → `main`.

---

## 13. Deployment Commands

```bash
# SSH to VPS
ssh root@178.16.129.216

# PM2 control
pm2 list                  # View all processes
pm2 restart nexusai-api   # Restart API
pm2 logs nexusai-api      # View API logs
pm2 logs nexusai-worker   # View worker logs
pm2 save                  # Save process list

# nginx
nginx -t                  # Test config
systemctl reload nginx    # Reload after changes

# n8n
cd /opt/n8n && docker compose ps
docker logs n8n-n8n-1 --tail 50

# DB backup
su - postgres -c 'pg_dump -d nexusai --schema-only' > schema.sql
su - postgres -c 'pg_dump -d nexusai' > full_backup.sql  # includes data

# SSL renewal check
certbot renew --dry-run
```

---

## 14. Key Observations from Audit

1. The VPS repo had only **1 commit** and 637 untracked files — all work was on disk but never committed
2. The handover branch, documents, and backups described in the briefing **did not exist** — they were created during this audit
3. The original Git history on GitHub has 5 commits on `main`, but the VPS had a shallow/grafted copy with only 1
4. macOS `._` resource fork files were present but excluded from commit
5. A corrupted `[object Object]` file (711 bytes) was found and removed
6. `nexusai-api` has crashed 362 times — likely a bug in the restart loop
7. No off-site backup strategy exists

---

## 15. Next Steps (Priority Order)

1. 🔴 Rotate all API keys exposed in `/opt/n8n/workflows/*.json`
2. 🔴 Enable UFW firewall (`ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`)
3. 🟡 Investigate `nexusai-api` restart loop (362 crashes)
4. 🟡 Investigate `n8n` unhealthy status
5. 🟡 Set up nightly `pg_dump` cron job
6. 🟡 Resolve duplicate migration 029
7. 🟢 Merge `handover/p0-disaster-recovery` → `main`
8. 🟢 Configure automated SSL renewal
9. 🟢 Set up off-site backup sync

---

*Generated 2026-05-24 via automated VPS audit.*
