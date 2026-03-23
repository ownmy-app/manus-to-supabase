"""Tests for manus-to-supabase migration — uses temp directories, no live project needed."""
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import migrate as m


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


def test_patch_package_json_removes_mysql2(tmp_path):
    _make_pkg(tmp_path, {"mysql2": "^3.0.0", "express": "^4.0.0"})
    m.patch_package_json(tmp_path)
    data = json.loads((tmp_path / "package.json").read_text())
    assert "mysql2" not in data["dependencies"]


def test_patch_package_json_idempotent(tmp_path):
    _make_pkg(tmp_path, {"@supabase/supabase-js": "^2.56.1", "pg": "^8.15.0"})
    m.patch_package_json(tmp_path)
    m.patch_package_json(tmp_path)
    data = json.loads((tmp_path / "package.json").read_text())
    # Should still have the deps after second run
    assert "@supabase/supabase-js" in data["dependencies"]


def test_patch_package_json_skips_missing(tmp_path):
    # No package.json — should not raise
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
