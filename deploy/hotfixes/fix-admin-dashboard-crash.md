# Hotfix: Admin dashboard black screen (ReferenceError)

## Root cause

In `AppLayout` (protected shell, minified as `P6`), auth destructures the user as `user: e` but the sidebar/profile UI referenced an undefined variable `me`:

```tsx
const { user: e, isAuthenticated: t, isLoading: r, signOut: a } = useAuth();
// ...
children: me?.plan        // ❌ ReferenceError: me is not defined
children: me?.email
children: me?.fullName
```

Production console showed `ReferenceError: me is not defined` (sometimes reported as minified `W` in other builds). This crashed every authenticated route (dashboard, admin).

## Fix

Use `e` (the `user` alias) and match API field names (`name`, not `fullName`):

```tsx
children: e?.plan
children: e?.email?.[0]?.toUpperCase()
children: e?.name || e?.email || "User"
children: e?.email
```

## Secondary fix: Admin Users page

Radix `Select.Item` cannot use `value=""`. "All Roles" / "All Status" filters used empty strings and crashed `/admin/users`.

- Use `value="all"` for filter placeholders
- Omit `role` / `status` query params when value is `"all"`

## Deployed

- Patched `/var/www/nexusai-frontend/assets/index-DBdjt4hA.js` on VPS `178.16.129.216`
- Backup: `index-DBdjt4hA.js.bak` (if created before overwrite)

## Verify

1. Open https://nexus-ai.group/#/login
2. Sign in as admin
3. Visit `/#/dashboard`, `/#/admin/dashboard`, `/#/admin/users`
4. Confirm no black screen and no `me is not defined` in browser console

## Rebuild from source

When SaaS frontend source is available, fix `AppLayout.tsx` (or equivalent) and rebuild with Vite; do not rely on minified patches long term.
