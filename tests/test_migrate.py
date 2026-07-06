"""Tests for manus-to-supabase migration - uses temp directories, no live project needed."""
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import manus_to_supabase.migrate as m


# ---------------------------------------------------------------------------
# patch_package_json tests
# ---------------------------------------------------------------------------

def _make_pkg(tmp: Path, deps: dict, dev_deps: dict = None) -> Path:
    pkg = {"dependencies": deps}
    if dev_deps:
        pkg["devDependencies"] = dev_deps
    p = tmp / "package.json"
    p.write_text(json.dumps(pkg, indent=2))
    return tmp


def test_patch_package_json_adds_supabase_deps(tmp_path):
    _make_pkg(tmp_path, {"express": "^4.0.0"})
    m.patch_package_json(tmp_path)
    data = json.loads((tmp_path / "package.json").read_text())
    assert "@supabase/supabase-js" in data["dependencies"]
    assert "pg" in data["dependencies"]
    assert data["dependencies"]["multer"] == "^2.0.2"
    assert data["devDependencies"]["@types/multer"] == "^2.0.0"
    assert data["devDependencies"]["@types/express"] == "4.17.21"


def test_patch_package_json_adds_express_if_missing(tmp_path):
    _make_pkg(tmp_path, {"typescript": "^5.9.0"})
    m.patch_package_json(tmp_path)
    data = json.loads((tmp_path / "package.json").read_text())
    assert data["dependencies"]["express"] == "^4.21.2"


def test_patch_package_json_removes_mysql2(tmp_path):
    _make_pkg(tmp_path, {"mysql2": "^3.0.0", "express": "^4.0.0"})
    m.patch_package_json(tmp_path)
    data = json.loads((tmp_path / "package.json").read_text())
    assert "mysql2" not in data["dependencies"]


def test_patch_package_json_idempotent(tmp_path):
    _make_pkg(
        tmp_path,
        {
            "@supabase/supabase-js": "^2.56.1",
            "pg": "^8.15.0",
            "jose": "6.1.0",
            "multer": "^2.0.2",
            "express": "^4.21.2",
        },
        dev_deps={"@types/multer": "^2.0.0", "@types/express": "4.17.21"},
    )
    m.patch_package_json(tmp_path)
    m.patch_package_json(tmp_path)
    data = json.loads((tmp_path / "package.json").read_text())
    # Should still have the deps after second run
    assert "@supabase/supabase-js" in data["dependencies"]


def test_patch_package_json_skips_missing(tmp_path):
    # No package.json - should not raise
    m.patch_package_json(tmp_path)


# ---------------------------------------------------------------------------
# collect_env_vars tests
# ---------------------------------------------------------------------------

def test_collect_env_vars_finds_process_env(tmp_path):
    (tmp_path / "index.ts").write_text("const key = process.env.MY_KEY;")
    found = m.collect_env_vars(tmp_path)
    assert "MY_KEY" in found


def test_collect_env_vars_finds_import_meta_env(tmp_path):
    (tmp_path / "app.tsx").write_text("const url = import.meta.env.VITE_API_URL;")
    found = m.collect_env_vars(tmp_path)
    assert "VITE_API_URL" in found


def test_collect_env_vars_skips_node_modules(tmp_path):
    nm = tmp_path / "node_modules" / "pkg"
    nm.mkdir(parents=True)
    (nm / "index.js").write_text("process.env.SECRET_KEY")
    found = m.collect_env_vars(tmp_path)
    assert "SECRET_KEY" not in found


# ---------------------------------------------------------------------------
# patch_env_ts tests
# ---------------------------------------------------------------------------

def test_patch_env_ts_adds_supabase_vars(tmp_path):
    core = tmp_path / "server" / "_core"
    core.mkdir(parents=True)
    (core / "env.ts").write_text(
        "export const env = {\n  isProduction: process.env.NODE_ENV === 'production',\n};\n"
    )
    m.patch_env_ts(tmp_path)
    content = (core / "env.ts").read_text()
    assert "supabaseUrl" in content
    assert "supabaseJwtSecret" in content


def test_patch_env_ts_idempotent(tmp_path):
    core = tmp_path / "server" / "_core"
    core.mkdir(parents=True)
    (core / "env.ts").write_text(
        "export const env = {\n  supabaseUrl: '',\n  isProduction: false,\n};\n"
    )
    m.patch_env_ts(tmp_path)
    # Should not duplicate
    content = (core / "env.ts").read_text()
    assert content.count("supabaseUrl") == 1


# ---------------------------------------------------------------------------
# transform_schema_mysql_to_pg tests (mirrors the web tool's in-browser rewrite)
# ---------------------------------------------------------------------------

def test_transform_schema_swaps_table_and_import():
    src = (
        'import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";\n'
        'export const users = mysqlTable("users", { id: int("id").primaryKey().autoincrement() });\n'
    )
    out = m.transform_schema_mysql_to_pg(src)
    assert "mysqlTable(" not in out
    assert "pgTable(" in out
    assert "drizzle-orm/pg-core" in out
    assert "drizzle-orm/mysql-core" not in out


def test_transform_schema_id_to_serial():
    src = (
        'import { mysqlTable, int } from "drizzle-orm/mysql-core";\n'
        'export const a = mysqlTable("a", { id: int("id").primaryKey().autoincrement() });\n'
        'export const b = mysqlTable("b", { id: int("id").primaryKey() });\n'
        'export const c = mysqlTable("c", { count: int("count") });\n'
    )
    out = m.transform_schema_mysql_to_pg(src)
    assert 'serial("id").primaryKey()' in out
    assert 'smallserial("id").primaryKey()' in out
    assert 'integer("count")' in out
    assert ".autoincrement()" not in out


def test_transform_schema_hoists_enum_and_renames_reserved():
    src = (
        'import { mysqlTable, mysqlEnum } from "drizzle-orm/mysql-core";\n'
        'export const u = mysqlTable("u", {\n'
        '  status: mysqlEnum("status", ["active", "off"]),\n'
        '});\n'
    )
    out = m.transform_schema_mysql_to_pg(src)
    # "status" is reserved -> hoisted type name becomes status_enum, usage keeps column name.
    assert "export const statusEnum = pgEnum('status_enum', [" in out
    assert 'statusEnum("status")' in out


def test_transform_schema_dedupes_same_enum_name():
    src = (
        'import { mysqlTable, mysqlEnum } from "drizzle-orm/mysql-core";\n'
        'export const a = mysqlTable("a", { role: mysqlEnum("role", ["x"]) });\n'
        'export const b = mysqlTable("b", { role: mysqlEnum("role", ["y"]) });\n'
    )
    out = m.transform_schema_mysql_to_pg(src)
    assert "export const roleEnum = pgEnum(" in out
    assert "export const roleEnum2 = pgEnum(" in out


def test_transform_schema_drops_auth_credentials():
    src = (
        'import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";\n'
        'export const authCredentials = mysqlTable("authCredentials", { id: int("id").primaryKey() });\n'
        'export type AuthCredential = typeof authCredentials.$inferSelect;\n'
        'export type InsertAuthCredential = typeof authCredentials.$inferInsert;\n'
        'export const users = mysqlTable("users", { id: int("id").primaryKey().autoincrement() });\n'
    )
    out = m.transform_schema_mysql_to_pg(src)
    assert "authCredentials" not in out
    assert "InsertAuthCredential" not in out
    assert "users" in out


def test_run_schema_file_to_out(tmp_path):
    src = tmp_path / "schema.ts"
    src.write_text(
        'import { mysqlTable, int } from "drizzle-orm/mysql-core";\n'
        'export const a = mysqlTable("a", { id: int("id").primaryKey().autoincrement() });\n'
    )
    out = tmp_path / "schema.pg.ts"
    rc = m.run_schema_file(str(src), str(out))
    assert rc == 0
    text = out.read_text()
    assert "pgTable(" in text
    assert 'serial("id").primaryKey()' in text
