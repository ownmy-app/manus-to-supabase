# manus-to-supabase

Built by the [Nometria](https://nometria.com) team. We help developers take apps built with AI tools (Lovable, Bolt, Base44, Replit) to production - handling deployment to AWS, security, scaling, and giving you full code ownership. [Learn more →](https://nometria.com)

> One-command migration for [Manus AI](https://manus.im) projects: swap MySQL→PostgreSQL, add Supabase auth, wire everything up.

Built for developers who generated a project on Manus and want to self-host it with Supabase + Postgres instead of the managed MySQL that Manus uses by default.

---

## Quick start

```bash
# Clone and install (zero runtime deps - pure stdlib)
git clone https://github.com/nometria/manus-to-supabase
cd manus-to-supabase
pip install -e .

# Run in your Manus project directory
manus-to-supabase /path/to/your/manus-project

# Or run in current directory
cd /path/to/manus-project
manus-to-supabase

# After migration: set env vars and install
cat >> .env << 'EOF'
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret
DATABASE_URL=postgresql://user:pass@host:5432/db
EOF
npm install
npm run dev

# Run tests
pytest tests/ -v
```

---

## What it does

Applies these changes to your Manus project automatically:

1. **`package.json`** - adds `@supabase/supabase-js`, `pg`, `jose`; removes `mysql2`
2. **Reference files** - copies in `Auth.tsx`, `AuthCallback.tsx`, `supabase-client.ts`, `supabase-auth.ts`, `unified-sdk.ts` from bundled templates
3. **`server/_core/env.ts`** - adds `supabaseUrl` and `supabaseJwtSecret` env vars
4. **`server/_core/index.ts`** - registers `registerSupabaseAuthRoutes` and `registerForgeReplacementRoutes`
5. **`shared/db.ts`** - patches Drizzle from `mysql2` to `pg`
6. **`client/src/App.tsx`** - adds `Auth` and `AuthCallback` route pages
7. **`.env.example`** - appends all discovered `SUPABASE_*` env vars
8. **Env var scan** - scans all `.ts/.tsx/.js/.jsx` files and prints required vars

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

# Transform a single Drizzle schema.ts (MySQL -> Postgres) and print it
manus-to-supabase --schema-file drizzle/schema.ts

# ...or write the converted schema to a file
manus-to-supabase --schema-file drizzle/schema.ts --out drizzle/schema.pg.ts
```

`--schema-file` runs only the Drizzle rewrite (`mysqlTable`->`pgTable`, `mysqlEnum`->`pgEnum`
with enum hoisting, `int("id")`->`serial`, dropping `authCredentials`) — the same
transform the web tool runs in the browser, so the CLI and web app stay in sync.

The script is **idempotent** - safe to run multiple times.

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

---

## Example output

Running `pytest tests/ -v`:

```
============================= test session starts ==============================
platform darwin -- Python 3.13.9, pytest-9.0.2, pluggy-1.5.0
cachedir: .pytest_cache
rootdir: /tmp/ownmy-releases/manus-to-supabase
configfile: pyproject.toml
plugins: anyio-4.12.1, cov-7.1.0
collecting ... collected 9 items

tests/test_migrate.py::test_patch_package_json_adds_supabase_deps PASSED [ 11%]
tests/test_migrate.py::test_patch_package_json_removes_mysql2 PASSED     [ 22%]
tests/test_migrate.py::test_patch_package_json_idempotent PASSED         [ 33%]
tests/test_migrate.py::test_patch_package_json_skips_missing PASSED      [ 44%]
tests/test_migrate.py::test_collect_env_vars_finds_process_env PASSED    [ 55%]
tests/test_migrate.py::test_collect_env_vars_finds_import_meta_env PASSED [ 66%]
tests/test_migrate.py::test_collect_env_vars_skips_node_modules PASSED   [ 77%]
tests/test_migrate.py::test_patch_env_ts_adds_supabase_vars PASSED       [ 88%]
tests/test_migrate.py::test_patch_env_ts_idempotent PASSED               [100%]

============================== 9 passed in 0.03s ===============================
```

See `examples/sample-manus-app/` for the typical Manus project structure before migration.

