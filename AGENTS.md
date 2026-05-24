# NexusAI Engineering Agent Workspace

## Workflow Pipeline

```
User Task
  ↓
Token Optimizer (primary, always first)
  ├─ Scopes task, finds relevant files
  ├─ Estimates token cost
  └─ Routes to correct subagent
      ↓
  Architect (if design/complexity needed)
      ├─ API contracts
      ├─ DB schema design
      └─ Implementation plan
          ↓
  Developer (implementation)
      ├─ Backend services
      ├─ Frontend components
      ├─ Migrations
      └─ Workers
          ↓
  Reviewer (git diff only)
      ├─ Security review
      ├─ Performance review
      └─ Maintainability review
          ↓
  QA (verification)
      ├─ Build verification
      ├─ API verification
      └─ Workflow validation
          ↓
  Deployment Gate
      ├─ Health checks
      ├─ Migration status
      └─ Approval gate
```

## Context Rules

- **Never** re-index the repository unless explicitly asked.
- **Never** load the entire repository by default.
- **Prefer** git diff over full file reads.
- **Prefer** file summaries (`ls`, `find`, `glob`) over full reads.
- **Reuse** previous context from the session.
- **Use** Flash/cheapest model whenever possible.
- **Use** Pro model only when complexity demands it (architecture, multi-file patches, security analysis).

## Codebase Conventions

- Backend: `backend/express/src/` — ESM TypeScript, raw SQL via `pg` pool, Express routes
- Frontend: `saas-frontend/src/` — React + Vite + Tailwind, shadcn-inspired components
- Migrations: `backend/express/src/db/migrations/` — numbered SQL files, forward-only
- Workers: PM2 processes defined in `backend/express/ecosystem.config.cjs`
- Database: PostgreSQL at `nexusai`, Redis for BullMQ queues

## File Organization

```
nexusai-egypt/
├── backend/express/src/
│   ├── config/          # db_pg, env, logger
│   ├── db/migrations/   # 00N_*.sql migration files
│   ├── middleware/       # auth, rate limit, audit
│   ├── routes/          # Express route handlers
│   ├── services/        # Business logic (DB, AI, WhatsApp, etc.)
│   ├── server.ts        # Express app entry
│   └── worker.ts        # BullMQ worker entry
├── saas-frontend/src/
│   ├── pages/           # Page components
│   │   └── admin/       # Admin-only pages
│   ├── components/      # Reusable UI components
│   ├── lib/             # API clients, utilities
│   └── App.tsx          # Router
├── n8n-workflows/       # Exported n8n workflow JSONs
└── deploy/              # Deployment scripts & hotfixes
```

## Agent Routing Rules

| Task Type | Agent | Model Tier |
|---|---|---|
| Find files, estimate cost, route task | `token-optimizer` (primary) | Flash |
| Architecture, DB design, API contracts | `architect` | Pro |
| Code implementation | `developer` | Pro |
| Code review (git diff) | `reviewer` | Flash |
| Build/API/UI verification | `qa` | Flash |
| Deployment checks, health | `deploy` | Flash |

## Project State

- **Production VPS:** 178.16.129.216
- **Domain:** nexus-ai.group
- **GitHub:** https://github.com/shiref7000-oss/nexusai-egypt
- **Branch:** handover/p0-disaster-recovery
- **PM2:** nexusai-api, nexusai-saas, nexusai-worker, tiktok-worker
- **n8n:** Docker on port 5678
