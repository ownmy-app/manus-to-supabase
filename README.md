# manus-to-supabase

> One-command migration for [Manus AI](https://manus.im) projects: swap MySQL→PostgreSQL, add Supabase auth, wire everything up.

Built for developers who generated a project on Manus and want to self-host it with Supabase + Postgres instead of the managed MySQL that Manus uses by default.

---

## What it does

Applies these changes to your Manus project automatically:

1. **`package.json`** — adds `@supabase/supabase-js`, `pg`, `jose`; removes `mysql2`
2. **Reference files** — copies in `Auth.tsx`, `AuthCallback.tsx`, `supabase-client.ts`, `supabase-auth.ts`, `unified-sdk.ts` from bundled templates
3. **`server/_core/env.ts`** — adds `supabaseUrl` and `supabaseJwtSecret` env vars
4. **`server/_core/index.ts`** — registers `registerSupabaseAuthRoutes` and `registerForgeReplacementRoutes`
5. **`shared/db.ts`** — patches Drizzle from `mysql2` to `pg`
6. **`client/src/App.tsx`** — adds `Auth` and `AuthCallback` route pages
7. **`.env.example`** — appends all discovered `SUPABASE_*` env vars
8. **Env var scan** — scans all `.ts/.tsx/.js/.jsx` files and prints required vars

---

## Install

```bash
pip install manus-to-supabase
```

Or run without installing:
```bash
pipx run manus-to-supabase /path/to/your/manus-project
```

---

## Usage

```bash
# Run in current directory (Manus project root)
manus-to-supabase

# Specify target directory
manus-to-supabase /path/to/manus-project
```

The script is **idempotent** — safe to run multiple times.

---

## After migration

Add these to your `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret
DATABASE_URL=postgresql://user:pass@host:5432/db
```

Then:
```bash
npm install
npm run dev
```

---

## Zero dependencies

The migration script uses only Python stdlib. No pip install required beyond the package itself.
