# NexusAI SaaS Frontend (source)

Rebuildable Vite app for production. **Do not patch minified bundles** — change source here and run `npm run build`.

## Admin user management

- **Plan** selector: Free, Basic, Pro, Enterprise (Basic → API/DB `starter`)
- **Status** selector: active, suspended, pending
- **Save** per row with optimistic UI refresh
- API: `PATCH /api/admin/users/:id/plan` and `PATCH /api/admin/users/:id/status` (same-origin `/api`)

## Build

```bash
cd saas-frontend
npm ci
npm run build
```

Deploy with `../deploy/deploy-saas-frontend.sh` (requires SSH to VPS).

## Env

`VITE_API_URL` — leave empty in production so requests use same-origin `/api`.
