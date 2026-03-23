#!/usr/bin/env python3
"""
Manus AI → Supabase + PostgreSQL migration script.

Applies the same changes to any Manus-generated project: add Supabase auth,
switch Drizzle from MySQL to PostgreSQL, and wire client/server auth.

Reference files (Auth.tsx, supabase-auth.ts, etc.) are bundled in the
scripts/reference/ folder next to this script, so the script is self-contained
and can be copied anywhere.

Usage:
  python manus_supabase_postgres_migrate.py [TARGET_DIR]

  TARGET_DIR: root of the Manus project to migrate (default: current directory).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path


# Bundled reference files (same folder as this script)
REFERENCE_DIR = Path(__file__).resolve().parent.parent / "reference"

# File extensions to scan for env vars
ENV_SCAN_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
# Directories to skip when scanning
ENV_SCAN_SKIP_DIRS = {"node_modules", "dist", ".git", "build", ".next", ".nuxt", "coverage", ".turbo"}

# Regexes to find env variable names (group 1 = var name)
ENV_PATTERNS = [
    re.compile(r"process\.env\.([A-Za-z_][A-Za-z0-9_]*)"),
    re.compile(r'process\.env\[["\']([^"\']+)["\']\]'),
    re.compile(r"import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)"),
    re.compile(r'import\.meta\.env\[["\']([^"\']+)["\']\]'),
    re.compile(r'getEnvVar\s*\(\s*["\']([^"\']+)["\']'),
    re.compile(r"Deno\.env\.get\s*\(\s*['\"]([^'\"]+)['\"]"),
]


def target_root(target_dir: str | None) -> Path:
    return Path(target_dir or os.getcwd()).resolve()


# ---------------------------------------------------------------------------
# 1. Package.json: add pg + Supabase deps, remove mysql2
# ---------------------------------------------------------------------------

def patch_package_json(target_root: Path) -> None:
    pkg_path = target_root / "package.json"
    if not pkg_path.exists():
        print("  [skip] package.json not found")
        return
    with open(pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    deps = data.get("dependencies") or {}
    to_add = {"@supabase/supabase-js": "^2.56.1", "pg": "^8.15.0"}
    if "jose" not in deps:
        to_add["jose"] = "6.1.0"
    changed = False
    for k, v in to_add.items():
        if k not in deps or deps[k] != v:
            deps[k] = v
            changed = True
    if "mysql2" in deps:
        del deps["mysql2"]
        changed = True
    if not changed:
        print("  [skip] package.json already has pg + Supabase deps, no mysql2")
        return
    data["dependencies"] = deps
    with open(pkg_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("  [ok] package.json updated (pg, @supabase/supabase-js, jose; mysql2 removed)")


# ---------------------------------------------------------------------------
# 2. Add Supabase and auth files (from reference)
# ---------------------------------------------------------------------------

FILES_TO_COPY = [
    ("shared/supabase-client.ts", "shared/supabase-client.ts"),
    ("client/src/lib/auth.ts", "client/src/lib/auth.ts"),
    ("client/src/pages/Auth.tsx", "client/src/pages/Auth.tsx"),
    ("client/src/pages/AuthCallback.tsx", "client/src/pages/AuthCallback.tsx"),
    ("server/_core/supabase-auth.ts", "server/_core/supabase-auth.ts"),
    ("server/_core/unified-sdk.ts", "server/_core/unified-sdk.ts"),
]

DIRS_TO_COPY = [
    ("server/_core/forge-replacement-apis", "server/_core/forge-replacement-apis"),
]


def copy_reference_files(target_root: Path) -> None:
    """Copy reference files from scripts/reference/ into the target project."""
    for rel_src, rel_dst in DIRS_TO_COPY:
        src = REFERENCE_DIR / rel_src
        dst = target_root / rel_dst
        if not src.exists():
            print(f"  [skip] reference folder missing: {rel_src} (not in scripts/reference/)")
            continue
        shutil.copytree(src, dst, dirs_exist_ok=True)
        print(f"  [ok] synced folder {rel_dst}")

    for rel_src, rel_dst in FILES_TO_COPY:
        src = REFERENCE_DIR / rel_src
        dst = target_root / rel_dst
        if not src.exists():
            print(f"  [skip] reference missing: {rel_src} (not in scripts/reference/)")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"  [ok] added {rel_dst}")


# ---------------------------------------------------------------------------
# 3. server/_core: env.ts (Supabase vars), index.ts (register Supabase auth)
# ---------------------------------------------------------------------------

def patch_env_ts(target_root: Path) -> None:
    path = target_root / "server/_core/env.ts"
    if not path.exists():
        print("  [skip] server/_core/env.ts not found")
        return
    text = path.read_text(encoding="utf-8")
    if "supabaseUrl" in text:
        print("  [skip] server/_core/env.ts already has Supabase vars")
        return
    # Add before the closing };
    insert = (
        "  // Supabase auth callback: use JWKS (recommended) or legacy JWT secret\n"
        "  supabaseUrl: process.env.VITE_SUPABASE_URL ?? \"\",\n"
        "  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? \"\",\n"
    )
    text = text.replace("  isProduction:", insert + "  isProduction:")
    path.write_text(text, encoding="utf-8")
    print("  [ok] server/_core/env.ts: added supabaseUrl, supabaseJwtSecret")


def patch_server_index_ts(target_root: Path) -> None:
    path = target_root / "server/_core/index.ts"
    if not path.exists():
        print("  [skip] server/_core/index.ts not found")
        return
    text = path.read_text(encoding="utf-8")
    changed = False
    if "registerOAuthRoutes" not in text:
        print("  [skip] server/_core/index.ts has no registerOAuthRoutes")
        return

    if "registerSupabaseAuthRoutes" not in text:
        text = text.replace(
            "import { registerOAuthRoutes } from \"./oauth\";",
            "import { registerOAuthRoutes } from \"./oauth\";\nimport { registerSupabaseAuthRoutes } from \"./supabase-auth\";",
        )
        changed = True

    if "registerForgeReplacementRoutes" not in text:
        if 'import { storageRouter } from "../storageRoutes";' in text:
            text = text.replace(
                'import { storageRouter } from "../storageRoutes";',
                'import { storageRouter } from "../storageRoutes";\nimport { registerForgeReplacementRoutes } from "./forge-replacement-apis";',
            )
        else:
            text = text.replace(
                "import { registerSupabaseAuthRoutes } from \"./supabase-auth\";",
                "import { registerSupabaseAuthRoutes } from \"./supabase-auth\";\nimport { registerForgeReplacementRoutes } from \"./forge-replacement-apis\";",
            )
        changed = True

    if "registerSupabaseAuthRoutes(app);" not in text:
        text = text.replace(
            "  registerOAuthRoutes(app);",
            "  registerOAuthRoutes(app);\n  // Supabase auth callback under /api/auth/supabase-callback\n  registerSupabaseAuthRoutes(app);",
        )
        changed = True

    if "registerForgeReplacementRoutes(app);" not in text:
        if '  app.use("/api/storage", storageRouter);' in text:
            text = text.replace(
                '  app.use("/api/storage", storageRouter);',
                '  app.use("/api/storage", storageRouter);\n  // Forge API replacement routes (must be before static file serving)\n  registerForgeReplacementRoutes(app);',
            )
        elif "createExpressMiddleware" in text:
            text = text.replace(
                "  // tRPC API",
                "  // Forge API replacement routes (must be before static file serving)\n  registerForgeReplacementRoutes(app);\n  // tRPC API",
            )
        changed = True

    if not changed:
        print("  [skip] server/_core/index.ts already has Supabase + forge route wiring")
        return

    path.write_text(text, encoding="utf-8")
    print("  [ok] server/_core/index.ts: wired Supabase auth + forge replacement routes")


# ---------------------------------------------------------------------------
# 4. App.tsx: useAuth, loading state, Auth + AuthCallback routes
# ---------------------------------------------------------------------------

def _ensure_imports(app_content: str, _target_root: Path) -> str:
    needed = [
        ('useAuth', 'import { useAuth } from "./_core/hooks/useAuth";'),
        ('from "./pages/Auth"', 'import Auth from "./pages/Auth";'),
        ('from "./pages/AuthCallback"', 'import AuthCallback from "./pages/AuthCallback";'),
    ]
    for key, line in needed:
        if key in app_content:
            continue
        # Insert after last existing import (e.g. after TooltipProvider or similar)
        insert_after = None
        for pattern in ["from \"@/components/ui/tooltip\";", "from \"./components/AppLayout\";"]:
            if pattern in app_content:
                insert_after = pattern
                break
        if insert_after:
            idx = app_content.index(insert_after) + len(insert_after)
            app_content = app_content[:idx] + "\n" + line + app_content[idx:]
    return app_content


def _extract_switch_routes(app_content: str) -> tuple[str, str]:
    """Returns (raw_inner, stripped_inner) so caller can match exact string and inject into stripped."""
    m = re.search(r"<Switch>(.*?)</Switch>", app_content, re.DOTALL)
    if not m:
        return "", ""
    raw = m.group(1)
    return raw, raw.strip()


def _inject_auth_routes_into_switch(switch_inner: str) -> str:
    auth_routes = (
        '<Route path="/auth/callback" component={AuthCallback} />\n      '
        '<Route path="/app-auth" component={Auth} />\n      '
    )
    if "/auth/callback" in switch_inner or "AuthCallback" in switch_inner:
        return switch_inner
    return auth_routes + switch_inner


def patch_app_tsx(target_root: Path) -> None:
    path = target_root / "client/src/App.tsx"
    if not path.exists():
        print("  [skip] client/src/App.tsx not found")
        return
    content = path.read_text(encoding="utf-8")

    # Already migrated
    if "useAuth" in content and "AuthCallback" in content and "loading" in content and "isLoading" in content:
        print("  [skip] client/src/App.tsx already has auth wiring")
        return

    content = _ensure_imports(content, target_root)

    # Ensure Router with useAuth and loading
    if "isLoading" not in content:
        # Find first <Switch> and the component that contains it; add useAuth + loading before it.
        # Insert loading block and wrap: we look for "return (" then newline then "<Switch>"
        pattern = re.compile(
            r"(\nfunction\s+\w+\([^)]*\)\s*\{\s*\n)(\s*return\s*\(\s*\n\s*<Switch>)",
            re.MULTILINE,
        )
        def repl(m: re.Match) -> str:
            pre, ret_switch = m.group(1), m.group(2)
            return (
                pre
                + "  const { isAuthenticated, loading: isLoading } = useAuth();\n"
                + "  \n"
                + "  if (isLoading) {\n"
                + "    return (\n"
                + "      <div className=\"flex items-center justify-center min-h-screen bg-background\">\n"
                + "        <div className=\"w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin\"></div>\n"
                + "      </div>\n"
                + "    );\n"
                + "  }\n"
                + "  \n"
                + ret_switch
            )
        content = pattern.sub(repl, content, count=1)

    # Inject auth routes inside <Switch>
    inner_raw, inner_stripped = _extract_switch_routes(content)
    if inner_stripped:
        new_inner = _inject_auth_routes_into_switch(inner_stripped)
        content = content.replace("<Switch>" + inner_raw + "</Switch>", "<Switch>" + new_inner + "</Switch>", 1)

    # Optional: ensure AppContent pattern (isAuthenticated ? AppLayout : Router only)
    # Many Manus apps already have AppLayout wrapping; we only ensure auth routes and loading.
    path.write_text(content, encoding="utf-8")
    print("  [ok] client/src/App.tsx: useAuth, loading, Auth/AuthCallback routes added")


# ---------------------------------------------------------------------------
# 5. Drizzle: schema (mysql → pg), db.ts (node-postgres, drop authCredentials), config
# ---------------------------------------------------------------------------

# PostgreSQL reserved keywords that should not be used as enum type names
POSTGRES_RESERVED_KEYWORDS = {
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 'authorization',
    'binary', 'both', 'case', 'cast', 'check', 'collate', 'column', 'concurrently', 'constraint',
    'create', 'cross', 'current_catalog', 'current_date', 'current_role', 'current_schema',
    'current_time', 'current_timestamp', 'current_user', 'default', 'deferrable', 'desc', 'distinct',
    'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'from', 'grant', 'group',
    'having', 'in', 'initially', 'inner', 'intersect', 'into', 'join', 'lateral', 'leading', 'left',
    'like', 'limit', 'localtime', 'localtimestamp', 'not', 'null', 'offset', 'on', 'only', 'or',
    'order', 'outer', 'over', 'overlaps', 'placing', 'primary', 'references', 'returning', 'right',
    'select', 'session_user', 'similar', 'some', 'symmetric', 'table', 'then', 'to', 'trailing',
    'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose', 'when', 'where', 'window',
    'with', 'role', 'status', 'action', 'type', 'user', 'group', 'order', 'table', 'column',
    'index', 'view', 'schema', 'database', 'function', 'procedure', 'trigger', 'sequence',
}


def _fix_enum_type_names(export_to_def: list[tuple[str, str, str]]) -> tuple[list[tuple[str, str, str]], dict[str, str]]:
    """
    Check enum type names for reserved keywords and duplicates, and automatically rename them.
    
    Returns:
        (updated_export_to_def, type_name_mapping) where type_name_mapping maps old type names to new ones
    """
    # Track all type names we've seen (to detect duplicates)
    seen_type_names: set[str] = set()
    type_name_mapping: dict[str, str] = {}  # old_name -> new_name
    updated_defs: list[tuple[str, str, str]] = []
    
    for export_name, type_name, values_str in export_to_def:
        original_type_name = type_name
        new_type_name = type_name
        
        # Check if it's a reserved keyword
        is_reserved = type_name.lower() in POSTGRES_RESERVED_KEYWORDS
        
        # Check if this exact type name was already used (duplicate)
        is_duplicate = type_name in seen_type_names
        
        if is_reserved or is_duplicate:
            # Generate a safe alternative name
            if is_reserved:
                # For reserved keywords, append _enum to make it safe
                base_name = f"{type_name}_enum"
            else:
                # For duplicates, use the original name with a counter
                base_name = type_name
            
            # Find a unique name by appending counter if needed
            counter = 1
            candidate_name = base_name
            
            while candidate_name in seen_type_names:
                counter += 1
                candidate_name = f"{base_name}_{counter}"
            
            new_type_name = candidate_name
            type_name_mapping[original_type_name] = new_type_name
        
        # Mark this type name as seen
        seen_type_names.add(new_type_name)
        updated_defs.append((export_name, new_type_name, values_str))
    
    return updated_defs, type_name_mapping


def transform_schema_mysql_to_pg(content: str) -> str:
    # Remove authCredentials table and its types (Supabase handles auth)
    content = re.sub(
        r"export const authCredentials = \w+Table\([^)]+\)[^;]+;[\s\S]*?export type AuthCredential [^\n]+\n[\s\S]*?export type InsertAuthCredential [^\n]+\n",
        "",
        content,
    )
    # Replace every MySQL import with PostgreSQL (single-line or multiline). First becomes pg import; rest removed.
    pg_import = 'import { smallserial, integer, pgEnum, pgTable, serial, text, timestamp, varchar, decimal, boolean, date, json } from "drizzle-orm/pg-core";\nimport { sql } from \'drizzle-orm\';'
    first = True
    def replace_mysql_import(m: re.Match) -> str:
        nonlocal first
        if first:
            first = False
            return m.group(1) + m.group(2) + pg_import + "\n\n"
        return m.group(1) + m.group(2)  # remove duplicate mysql-core import
    content = re.sub(
        r"(^|\n)(\s*)import\s*\{[\s\S]*?\}\s*from\s*[\"']drizzle-orm/mysql-core[\"'];?\s*\n?",
        replace_mysql_import,
        content,
    )
    if "drizzle-orm/pg-core" not in content:
        content = pg_import + "\n\n" + content
    # Replace mysqlTable with pgTable, mysqlEnum with pgEnum
    content = content.replace("mysqlTable(", "pgTable(")
    content = content.replace("mysqlEnum(", "pgEnum(")
    # Postgres: enums must be defined first, then used. Extract inline pgEnum("name", [...]) and
    # replace with top-level export const nameEnum = pgEnum('name', [...]); and usage nameEnum().
    # Use [\s\S]*? so multiline enum arrays are captured. Same enum name with different values
    # gets unique type names (status_2, status_3) and export names (statusEnum2, statusEnum3).
    enum_pattern = re.compile(
        r"pgEnum\(([\"'])(\w+)\1,\s*\[([\s\S]*?)\]\)(?:\(\1\2\1\))?",
        re.DOTALL,
    )
    key_to_export: dict[tuple[str, str], str] = {}  # (name, values_str) -> export_name
    name_count: dict[str, int] = {}
    for m in enum_pattern.finditer(content):
        name, values_str = m.group(2), m.group(3)
        key = (name, values_str)
        if key in key_to_export:
            continue
        name_count[name] = name_count.get(name, 0) + 1
        n = name_count[name]
        export_name = f"{name}Enum" if n == 1 else f"{name}Enum{n}"
        key_to_export[key] = export_name
    if key_to_export:
        # Build (export_name, type_name, values_str) for each unique enum. Type name must be unique in PG.
        export_to_def: list[tuple[str, str, str]] = []
        name_counter: dict[str, int] = {}
        for (name, values_str), export_name in key_to_export.items():
            name_counter[name] = name_counter.get(name, 0) + 1
            n = name_counter[name]
            type_name = name if n == 1 else f"{name}_{n}"
            export_to_def.append((export_name, type_name, values_str))
        
        # Fix enum type names: check for reserved keywords and duplicates, auto-rename
        export_to_def, type_name_mapping = _fix_enum_type_names(export_to_def)
        
        enum_lines = [
            f"export const {ex} = pgEnum('{ty}', [{vals}]);"
            for ex, ty, vals in export_to_def
        ]
        enum_block = "\n".join(enum_lines) + "\n\n"
        # Replace inline pgEnum FIRST (so we don't replace our own export lines later)
        # Preserve the column name (enum name) when calling the enum function
        # The export_name doesn't change, only the type_name inside pgEnum() changes
        content = enum_pattern.sub(
            lambda m: key_to_export[(m.group(2), m.group(3))] + f'("{m.group(2)}")',
            content,
        )
        # Insert enum definitions after last import in the FILE HEADER only (ignore later imports).
        insert_matches = list(re.finditer(
            r"from\s+[\"']drizzle-orm[^\"']*[\"'];?\s*\n",
            content,
        ))
        # Header ends at first table or first block comment (some files have more imports later).
        header_end = len(content)
        for sentinel in ("\nexport const ", "\n/**", "\nexport type "):
            idx = content.find(sentinel, 50)
            if idx != -1 and idx < header_end:
                header_end = idx
        header_imports = [m for m in insert_matches if m.start() < header_end]
        if header_imports:
            insert_pos = header_imports[-1].end()
            while insert_pos < len(content) and content[insert_pos] in "\n ":
                insert_pos += 1
            content = content[:insert_pos] + "\n" + enum_block + content[insert_pos:]
    # .onUpdateNow() doesn't exist in PG — use .$onUpdate(() => new Date())
    content = content.replace(".onUpdateNow()", ".$onUpdate(() => new Date())")
    # int("id").primaryKey().autoincrement() or int("id").autoincrement().primaryKey() -> serial("id").primaryKey()
    content = re.sub(
        r"\bint\s*\(\s*[\"']id[\"']\s*\)\s*(?:\.primaryKey\(\)\s*\.autoincrement\(\)|\.autoincrement\(\)\s*\.primaryKey\(\))",
        'serial("id").primaryKey()',
        content,
    )
    # integer("id").autoincrement() or integer("id").primaryKey().autoincrement() -> serial("id").primaryKey() or serial("id")
    content = re.sub(
        r"integer\s*\(\s*[\"']id[\"']\s*\)\s*\.primaryKey\(\)\s*\.autoincrement\(\)",
        'serial("id").primaryKey()',
        content,
    )
    content = re.sub(
        r"integer\s*\(\s*[\"']id[\"']\s*\)\s*\.autoincrement\(\)",
        'serial("id")',
        content,
    )
    # Remove any remaining .autoincrement() (Postgres has no such method; serial handles it)
    content = re.sub(r"\.autoincrement\(\)", "", content)
    # int("id").primaryKey() -> smallserial("id").primaryKey()
    content = re.sub(
        r"\bint\s*\(\s*[\"']id[\"']\s*\)\s*\.primaryKey\(\)",
        'smallserial("id").primaryKey()',
        content,
    )
    # int("columnName") -> integer("columnName")
    content = re.sub(r"\bint\s*\(\s*[\"'](\w+)[\"']\s*\)", r'integer("\1")', content)
    return content


def patch_schema_ts(target_root: Path) -> None:
    path = target_root / "drizzle/schema.ts"
    if not path.exists():
        print("  [skip] drizzle/schema.ts not found")
        return
    content = path.read_text(encoding="utf-8")
    # Skip if already PostgreSQL (no uncommented mysql-core import)
    has_pg = "pgTable(" in content and "drizzle-orm/pg-core" in content
    has_active_mysql = any(
        "drizzle-orm/mysql-core" in line and not line.strip().startswith("//")
        for line in content.splitlines()
    )
    if has_pg and not has_active_mysql:
        print("  [skip] drizzle/schema.ts already PostgreSQL")
        return
    content = transform_schema_mysql_to_pg(content)
    path.write_text(content, encoding="utf-8")
    print("  [ok] drizzle/schema.ts: converted to PostgreSQL, removed authCredentials")


# MySQL -> Postgres: table name -> conflict target column for onConflictDoUpdate (replaces onDuplicateKeyUpdate)
DB_UPSERT_CONFLICT_TARGET: dict[str, str] = {
    "users": "openId",
    # Add more table -> unique column as needed, e.g. "sessions": "token"
}


def _replace_on_duplicate_key_update(content: str) -> str:
    """Replace MySQL .onDuplicateKeyUpdate({ set: X }) with Postgres .onConflictDoUpdate({ target: table.col, set: X })."""
    # Match: .insert(TABLE).values(...).onDuplicateKeyUpdate({ set: SET_VAR  (values can be multiline)
    pattern = re.compile(
        r"(\.insert\((\w+)\)\s*\.values\(.*?\))\s*\.onDuplicateKeyUpdate\(\{\s*set:\s*(\w+)",
        re.DOTALL,
    )
    def repl(m: re.Match) -> str:
        table = m.group(2)
        set_var = m.group(3)
        col = DB_UPSERT_CONFLICT_TARGET.get(table, "id")
        return f"{m.group(1)}.onConflictDoUpdate({{ target: {table}.{col}, set: {set_var}"
    return pattern.sub(repl, content)


def patch_db_ts(target_root: Path) -> None:
    path = target_root / "server/db.ts"
    if not path.exists():
        print("  [skip] server/db.ts not found")
        return
    content = path.read_text(encoding="utf-8")
    changed = False
    if "drizzle-orm/mysql2" in content:
        content = content.replace("drizzle-orm/mysql2", "drizzle-orm/node-postgres")
        content ="import { Pool } from 'pg';" + "\n" + content
        changed = True
    if "drizzle(process.env.DATABASE_URL)" in content:
        content = content.replace("drizzle(process.env.DATABASE_URL)", "drizzle({ client: new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, keepAlive: true }) })")
        changed = True

    # Remove authCredentials and InsertAuthCredential from schema import (whole line each)
    if "authCredentials" in content or "InsertAuthCredential" in content:
        for name in ("authCredentials", "InsertAuthCredential"):
            content = re.sub(rf"\n\s*{re.escape(name)}\s*,?\s*\n", "\n", content)
        changed = True
    # MySQL: onDuplicateKeyUpdate -> Postgres: onConflictDoUpdate with target
    if "onDuplicateKeyUpdate" in content:
        content = _replace_on_duplicate_key_update(content)
        changed = True
    # Add compatibility wrapper so legacy insert() call sites can keep using result[0].insertId
    if "function wrapDb(" not in content:
        content = content.replace(
            "let _db: ReturnType<typeof drizzle> | null = null;",
            (
                "let _db: ReturnType<typeof drizzle> | null = null;\n"
                "let _wrappedDb: ReturnType<typeof drizzle> | null = null;\n\n"
                "function wrapDb(db: ReturnType<typeof drizzle>): ReturnType<typeof drizzle> {\n"
                "  return new Proxy(db as object, {\n"
                "    get(target, prop, receiver) {\n"
                "      const value = Reflect.get(target, prop, receiver);\n"
                "      if (prop !== \"insert\" || typeof value !== \"function\") {\n"
                "        return value;\n"
                "      }\n\n"
                "      return (table: unknown) => {\n"
                "        const insertBuilder = value.call(target, table);\n"
                "        if (!insertBuilder || typeof insertBuilder !== \"object\") {\n"
                "          return insertBuilder;\n"
                "        }\n\n"
                "        return new Proxy(insertBuilder as object, {\n"
                "          get(insertTarget, insertProp, insertReceiver) {\n"
                "            const insertValue = Reflect.get(insertTarget, insertProp, insertReceiver);\n"
                "            if (insertProp !== \"values\" || typeof insertValue !== \"function\") {\n"
                "              return insertValue;\n"
                "            }\n\n"
                "            return (...args: unknown[]) => {\n"
                "              const query = insertValue.apply(insertTarget, args);\n"
                "              const tableIdColumn = (table as { id?: unknown } | undefined)?.id;\n"
                "              const hasReturning = query && typeof (query as { returning?: unknown }).returning === \"function\";\n"
                "              if (tableIdColumn && hasReturning) {\n"
                "                return (query as { returning: (fields: Record<string, unknown>) => unknown }).returning({\n"
                "                  insertId: tableIdColumn,\n"
                "                });\n"
                "              }\n"
                "              return query;\n"
                "            };\n"
                "          },\n"
                "        });\n"
                "      };\n"
                "    },\n"
                "  }) as ReturnType<typeof drizzle>;\n"
                "}\n"
            ),
        )
        changed = True

    if "_wrappedDb = wrapDb(_db);" not in content and "_db = drizzle(pool);" in content:
        content = content.replace("_db = drizzle(pool);", "_db = drizzle(pool);\n      _wrappedDb = wrapDb(_db);")
        changed = True

    if "_wrappedDb = null;" not in content and "_db = null;" in content:
        content = content.replace("_db = null;", "_db = null;\n      _wrappedDb = null;")
        changed = True

    if "return _wrappedDb;" not in content and "return _db;" in content:
        content = content.replace("return _db;", "return _wrappedDb;")
        changed = True

    if "if ((!_db || !_wrappedDb) && process.env.DATABASE_URL)" not in content:
        content = content.replace(
            "if (!_db && process.env.DATABASE_URL) {",
            "if ((!_db || !_wrappedDb) && process.env.DATABASE_URL) {",
        )
        changed = True

    if not changed:
        print("  [skip] server/db.ts already migrated + wrapped")
        return
    path.write_text(content, encoding="utf-8")
    print("  [ok] server/db.ts: node-postgres + compatibility wrapper + onConflictDoUpdate")


def patch_drizzle_config(target_root: Path) -> None:
    path = target_root / "drizzle.config.ts"
    if not path.exists():
        print("  [skip] drizzle.config.ts not found")
        return
    content = path.read_text(encoding="utf-8")
    if "postgresql" in content and "dialect" in content:
        print("  [skip] drizzle.config.ts already PostgreSQL")
        return
    content = content.replace('"mysql"', '"postgresql"')
    content = content.replace("'mysql'", "'postgresql'")
    if "driver: 'mysql2'" in content or '"mysql2"' in content:
        content = re.sub(r'\s*driver:\s*[\'"]mysql2[\'"],?\s*', "\n  ", content)
    path.write_text(content, encoding="utf-8")
    print("  [ok] drizzle.config.ts: dialect postgresql")


def reset_drizzle_migrations(target_root: Path) -> None:
    meta = target_root / "drizzle/meta"
    if not meta.exists():
        return
    journal = meta / "_journal.json"
    if not journal.exists():
        return
    data = json.loads(journal.read_text(encoding="utf-8"))
    if data.get("dialect") == "postgresql":
        print("  [skip] drizzle journal already postgresql")
        return
    data["dialect"] = "postgresql"
    data["entries"] = []
    journal.write_text(json.dumps(data, indent=2), encoding="utf-8")
    for f in (target_root / "drizzle").glob("*.sql"):
        if f.name.startswith("0"):
            f.unlink()
    for f in meta.glob("*.json"):
        if f.name != "_journal.json" and f.name.startswith("0"):
            f.unlink()
    print("  [ok] drizzle: cleared old MySQL migrations (run pnpm db:push to generate new)")


# ---------------------------------------------------------------------------
# 6. server/_core/oauth.ts: use unified-sdk instead of sdk
# ---------------------------------------------------------------------------

def patch_oauth_ts(target_root: Path) -> None:
    path = target_root / "server/_core/oauth.ts"
    if not path.exists():
        print("  [skip] server/_core/oauth.ts not found")
        return
    content = path.read_text(encoding="utf-8")
    if "unified-sdk" in content:
        print("  [skip] server/_core/oauth.ts already uses unified-sdk")
        return
    # Replace import from "./sdk" to "./unified-sdk"
    if 'from "./sdk"' in content:
        content = content.replace('from "./sdk"', 'from "./unified-sdk"')
        path.write_text(content, encoding="utf-8")
        print("  [ok] server/_core/oauth.ts: updated to use unified-sdk")
    elif 'from "./sdk";' in content:
        content = content.replace('from "./sdk";', 'from "./unified-sdk";')
        path.write_text(content, encoding="utf-8")
        print("  [ok] server/_core/oauth.ts: updated to use unified-sdk")
    else:
        print("  [skip] server/_core/oauth.ts: no sdk import found to replace")


# ---------------------------------------------------------------------------
# 7. client const: getLoginUrl → /app-auth for Supabase
# ---------------------------------------------------------------------------

def patch_client_const_ts(target_root: Path) -> None:
    path = target_root / "client/src/const.ts"
    if not path.exists():
        print("  [skip] client/src/const.ts not found")
        return
    content = path.read_text(encoding="utf-8")
    if "app-auth" in content and "getLoginUrl" in content:
        print("  [skip] client/src/const.ts already uses /app-auth")
        return
    # Replace getLoginUrl implementation with simple return "/app-auth"
    new_get_login = (
        "// Supabase self-hosted: use in-app auth page\n"
        "export const getLoginUrl = () => \"/app-auth\";\n"
    )
    if re.search(r"export (const|function) getLoginUrl", content):
        content = re.sub(
            r"export (const|function) getLoginUrl[^;]*\{[^}]*\};?",
            new_get_login.rstrip(),
            content,
            count=1,
        )
        path.write_text(content, encoding="utf-8")
        print("  [ok] client/src/const.ts: getLoginUrl → /app-auth")
    else:
        print("  [skip] client/src/const.ts: no getLoginUrl to replace")
        return


# ---------------------------------------------------------------------------
# 8. Scan codebase for env vars and generate .env.template
# ---------------------------------------------------------------------------

def collect_env_vars(target_root: Path) -> set[str]:
    """Search codebase for process.env.*, import.meta.env.*, getEnvVar(…), Deno.env.get(…)."""
    found: set[str] = set()
    for path in target_root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in ENV_SCAN_EXTENSIONS:
            continue
        if any(skip in path.parts for skip in ENV_SCAN_SKIP_DIRS):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for pattern in ENV_PATTERNS:
            for m in pattern.finditer(text):
                found.add(m.group(1))
    return found


def generate_env_template(target_root: Path) -> None:
    """Create .env.template with all env variables found in the codebase."""
    vars_set = collect_env_vars(target_root)
    if not vars_set:
        print("  [skip] no env variables found in codebase")
        return
    sorted_vars = sorted(vars_set)
    lines = [
        "# Copy this file to .env and fill in values.",
        "# Generated by manus_supabase_postgres_migrate.py from env vars found in the codebase.",
        "",
    ]
    # Minimal groups for readability
    vite = [v for v in sorted_vars if v.startswith("VITE_")]
    rest = [v for v in sorted_vars if not v.startswith("VITE_")]
    if rest:
        lines.append("# Server / shared")
        for v in rest:
            lines.append(f"{v}=")
        lines.append("")
    if vite:
        lines.append("# Client (Vite – exposed to browser)")
        for v in vite:
            lines.append(f"{v}=")
    out_path = target_root / ".env.template"
    out_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    print(f"  [ok] .env.template created with {len(sorted_vars)} variables")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_schema_test() -> int:
    """Run transform on oma_scripts/schema-test.ts and write schema-test-out.ts. For CI/debug."""
    script_dir = Path(__file__).resolve().parent
    test_in = script_dir / "schema-test.ts"
    test_out = script_dir / "schema-test-out.ts"
    if not test_in.exists():
        print(f"Test file not found: {test_in}", file=sys.stderr)
        return 1
    content = test_in.read_text(encoding="utf-8")
    out = transform_schema_mysql_to_pg(content)
    test_out.write_text(out, encoding="utf-8")
    export_count = len(re.findall(r"export const \w+Enum = pgEnum\(", out))
    inline_remaining = len(re.findall(r"pgEnum\(\s*[\"']", out)) - export_count
    print(f"Wrote {test_out}")
    print(f"  export const ...Enum = pgEnum(...): {export_count}")
    print(f"  inline pgEnum(...) remaining (should be 0): {inline_remaining}")
    if "mysqlTable(" in out or "mysqlEnum(" in out:
        print("  [FAIL] mysqlTable/mysqlEnum still present", file=sys.stderr)
        return 1
    if ".onUpdateNow()" in out:
        print("  [FAIL] .onUpdateNow() still present", file=sys.stderr)
        return 1
    if ".autoincrement()" in out:
        print("  [FAIL] .autoincrement() still present", file=sys.stderr)
        return 1
    print("  [OK] schema transform test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate Manus project to Supabase auth + PostgreSQL")
    parser.add_argument("target_dir", nargs="?", default=None, help="Target project root (default: cwd)")
    parser.add_argument("--test", action="store_true", help="Run transform on oma_scripts/schema-test.ts → schema-test-out.ts")
    args = parser.parse_args()

    if args.test:
        return run_schema_test()

    target = target_root(args.target_dir)

    if not (target / "package.json").exists():
        print(f"Target does not look like a project root: {target}", file=sys.stderr)
        return 1

    print(f"Reference files: {REFERENCE_DIR}")
    print(f"Target project: {target}\n")

    steps = [
        ("Package.json (pg, Supabase, jose; remove mysql2)", lambda: patch_package_json(target)),
        ("Copy Supabase/auth + forge replacement files from scripts/reference/", lambda: copy_reference_files(target)),
        ("server/_core/env.ts", lambda: patch_env_ts(target)),
        ("server/_core/index.ts", lambda: patch_server_index_ts(target)),
        ("server/_core/oauth.ts (use unified-sdk)", lambda: patch_oauth_ts(target)),
        ("client/src/App.tsx", lambda: patch_app_tsx(target)),
        ("drizzle/schema.ts (MySQL → PG)", lambda: patch_schema_ts(target)),
        ("server/db.ts (node-postgres, no authCredentials)", lambda: patch_db_ts(target)),
        ("drizzle.config.ts", lambda: patch_drizzle_config(target)),
        ("client/src/const.ts (getLoginUrl)", lambda: patch_client_const_ts(target)),
        ("Drizzle migrations reset", lambda: reset_drizzle_migrations(target)),
        (".env.template (from codebase env vars)", lambda: generate_env_template(target)),
    ]

    for name, step in steps:
        print(f"[{name}]")
        try:
            step()
        except Exception as e:
            print(f"  [error] {e}", file=sys.stderr)
        print()

    print("Done. Next steps:")
    print("  1. Set .env: DATABASE_URL (PostgreSQL), VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY")
    print("     Optional server key for storage routes: SUPABASE_SERVICE_ROLE_KEY")
    print("  2. Set client env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY")
    print("  3. pnpm install && pnpm db:push")
    print("  4. If the app later crashes with db_termination / FATAL XX000, see scripts/POSTGRES_CONNECTION_NOTES.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
