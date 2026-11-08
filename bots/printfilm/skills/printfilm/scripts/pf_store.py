"""Workspace storage, revision history and media provenance for the PRINTFILM bot.

No server, credentials or model calls. All paths are checked against the bot workspace.
"""
from __future__ import annotations

import contextlib
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
import time
import uuid

MAX_JSON = 1900000  # Bridge limit is 2 MiB; episodes have separate files.
ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")
KINDS = {"short", "drama", "canvas"}
ASSET_TYPES = {"character", "scene", "prop", "material", "voice", "image", "video", "audio"}
DEFAULTS = {"mode": "video", "ratio": "9:16", "resolution": "720p", "style": "cgi-3d-animation",
            "audioMode": "native", "voice": "zh-CN-XiaoxiaoNeural", "subtitles": True,
            "imageModel": "", "videoModel": "", "bgm": "", "bgmVolume": 0.15,
            "targetDuration": 60, "episodeCount": 1, "language": "zh-CN"}


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def uid(prefix):
    return prefix + "-" + uuid.uuid4().hex[:16]


def ident(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ValueError("Invalid identifier")
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()


def file_digest(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def number(value, minimum=0, maximum=86400):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f"Expected a number between {minimum} and {maximum}")
    return value


def text(value, maximum=200000):
    if not isinstance(value, str) or len(value) > maximum:
        raise ValueError("Expected text within the supported size")
    return value


def settings(raw, base=None):
    out = dict(base or DEFAULTS)
    if not isinstance(raw, dict) or set(raw) - set(DEFAULTS):
        raise ValueError("Unknown project setting")
    for k, v in raw.items():
        if k == "subtitles":
            if not isinstance(v, bool):
                raise ValueError("subtitles must be boolean")
        elif k in ("targetDuration", "episodeCount", "bgmVolume"):
            number(v, 0 if k == "bgmVolume" else 1, 1 if k == "bgmVolume" else 120 if k == "episodeCount" else 86400)
            if k == "episodeCount" and int(v) != v:
                raise ValueError("episodeCount must be an integer")
        else:
            text(v, 2000)
        out[k] = v
    for k, choices in {"mode": {"video", "image_text"}, "ratio": {"9:16", "16:9", "1:1", "4:3", "3:4", "21:9"},
                       "resolution": {"480p", "720p", "768p", "1080p"}, "audioMode": {"native", "tts", "silent"}}.items():
        if out[k] not in choices:
            raise ValueError(f"Invalid {k}")
    return out


class Store:
    def __init__(self, root=None):
        self.root = Path(root or Path.cwd()).resolve()
        self.base = self.path("app/printfilm")
        self.base.mkdir(parents=True, exist_ok=True)

    def path(self, relative, exists=False):
        if not isinstance(relative, str) or not relative or "\x00" in relative or "\\" in relative:
            raise ValueError("Invalid workspace path")
        p = Path(relative)
        if p.is_absolute() or any(part in ("..",) for part in p.parts) or ":" in relative:
            raise ValueError("Only workspace-relative paths are allowed")
        candidate = self.root / p
        for parent in [candidate, *candidate.parents]:
            if parent == self.root:
                break
            if parent.is_symlink():
                raise ValueError("Symlinks are not allowed")
        if not candidate.resolve().is_relative_to(self.root):
            raise ValueError("Path leaves workspace")
        if exists:
            if not candidate.is_file() or candidate.stat().st_nlink != 1:
                raise ValueError("File missing or not a regular private workspace file")
        return candidate

    def relative(self, p):
        return p.relative_to(self.root).as_posix()

    @contextlib.contextmanager
    def lock(self):
        p = self.path("app/printfilm/.lock")
        with p.open("a+b") as f:
            f.seek(0)
            f.write(b"0")
            f.flush()
            f.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(f, fcntl.LOCK_EX)
            try:
                if self.recover():
                    self.sync()
                yield
            finally:
                f.seek(0)
                if os.name == "nt":
                    msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(f, fcntl.LOCK_UN)

    def read(self, relative, limit=MAX_JSON):
        p = self.path(relative, True)
        if p.stat().st_size > limit:
            raise ValueError("Document too large; keep episodes in separate documents")
        return json.loads(p.read_text(encoding="utf-8"))

    def write(self, relative, obj, limit=MAX_JSON):
        p = self.path(relative)
        data = json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        if len(data.encode()) > limit:
            raise ValueError("Document exceeds bridge size limit; split into episodes")
        p.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".write-", dir=p.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, p)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def project_path(self, pid):
        return f"app/printfilm/projects/{ident(pid)}/project.json"

    def project(self, pid):
        return self.read(self.project_path(pid))

    def episode_path(self, pid, eid):
        return f"app/printfilm/projects/{ident(pid)}/episodes/{ident(eid)}.json"

    def episode(self, project, eid):
        descriptor = next((e for e in project["episodes"] if e["id"] == eid), None)
        if not descriptor:
            raise ValueError("Episode does not belong to project")
        return self.read(descriptor["path"])

    def recover(self):
        journal = "app/printfilm/pending.json"
        if not self.path(journal).exists():
            return False
        writes = self.read(journal, MAX_JSON * 3)["writes"]
        for relative, value in writes.items():
            if not relative.startswith("app/printfilm/projects/") or not relative.endswith(".json"):
                raise ValueError("Invalid transaction path")
            self.write(relative, value)
        self.path(journal).unlink()
        return True

    def revision(self, doc, expected):
        if expected is not None and expected != doc["revision"]:
            raise ValueError(f"Revision conflict: expected {expected}, current {doc['revision']}; reload before editing")

    def commit(self, project, label, episode=None):
        pid = project["id"]
        previous = self.project(pid) if self.path(self.project_path(pid)).exists() else None
        version = uid("v")
        if previous:
            snap = {"project": previous, "episode": self.episode(previous, episode["id"]) if episode and any(e["id"] == episode["id"] for e in previous["episodes"]) else None}
            self.write(f"app/printfilm/projects/{pid}/history/{version}.json", snap)
            project["history"] = (previous.get("history", []) + [{"id": version, "label": label, "at": now(), "episodeId": episode["id"] if episode else ""}])[-200:]
        project["revision"] = (previous or {}).get("revision", 0) + 1
        project["updatedAt"] = now()
        writes = {}
        if episode:
            current = next((e for e in (previous or {}).get("episodes", []) if e["id"] == episode["id"]), {})
            episode["revision"] = max(episode.get("revision", 0), current.get("revision", 0)) + 1
            episode["updatedAt"] = now()
            # Immutable episode files let a whole-project snapshot restore all episodes consistently.
            episode_file = self.episode_path(pid, episode["id"]).removesuffix(".json") + "-" + uid("v") + ".json"
            writes[episode_file] = episode
            descriptor = {k: episode[k] for k in ("id", "number", "title", "summary", "revision")}
            descriptor.update(shots=len(episode["shots"]), path=episode_file)
            project["episodes"] = [e for e in project["episodes"] if e["id"] != episode["id"]] + [descriptor]
            project["episodes"].sort(key=lambda e: e["number"])
        writes[self.project_path(pid)] = project
        for value in writes.values():
            if len((json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()) > MAX_JSON:
                raise ValueError("Document exceeds bridge size limit; split into episodes")
        self.write("app/printfilm/pending.json", {"writes": writes}, MAX_JSON * 3)
        self.recover()
        self.sync(pid)
        return {"projectId": pid, "revision": project["revision"], "episodeId": episode["id"] if episode else None}

    def sync(self, selected=None):
        st = {}
        if self.path("app/state.json").exists():
            st = self.read("app/state.json")
        entries = []
        for f in sorted((self.base / "projects").glob("*/project.json")):
            p = self.read(self.relative(f))
            entries.append({k: p[k] for k in ("id", "title", "kind", "updatedAt", "revision", "archived") } |
                           {"path": self.relative(f), "episodes": len(p["episodes"]), "assets": len(p["assets"]), "exports": len(p["exports"])})
        entries.sort(key=lambda p: p["updatedAt"], reverse=True)
        state = {"title": "PRINTFILM", "projects": entries, "selectedProjectId": selected or st.get("selectedProjectId", ""),
                 "runtime": st.get("runtime", {}), "updatedAt": now(), "sample": False}
        self.write("app/state.json", state)
        return state

    def media_path(self, pid, kind, suffix):
        p = self.path(f"app/printfilm/projects/{ident(pid)}/media/{uid(kind)}{suffix.lower()}")
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def active(self, obj, kind):
        items = obj.get("media", {}).get(kind, [])
        selected = obj.get("selectedMedia", {}).get(kind)
        item = next((m for m in items if m["id"] == selected), items[-1] if items else None)
        if item:
            try:
                p = self.path(item["path"], True)
                if p.stat().st_size:
                    return item
            except ValueError:
                pass
        return None

    def signature(self, project, obj, kind):
        s = project["settings"]
        refs = []
        for aid in obj.get("assetIds", []):
            asset = next((a for a in project["assets"] if a["id"] == aid), None)
            if not asset:
                raise ValueError(f"Unknown reference asset: {aid}")
            refs.append({"id": aid, "prompt": asset.get("prompt", ""), "media": [self.active(asset, k) for k in ("image", "video", "audio")]})
        if kind == "image":
            data = [obj.get("visualPrompt", obj.get("prompt", "")), refs, s["style"], s["ratio"], s["imageModel"]]
        elif kind == "audio":
            data = [obj.get("narration", obj.get("prompt", "")), obj.get("voice", s["voice"]), obj.get("dialogue", []), refs]
        else:
            data = [obj.get("videoPrompt", obj.get("prompt", "")), obj.get("segmentScript", ""), obj.get("duration", 0),
                    self.active(obj, "image"), refs, s["videoModel"], s["resolution"], s["ratio"], s["audioMode"]]
        return digest(data)

    def target(self, project, episode=None, target=None):
        if not target:
            raise ValueError("A shot or asset identifier is required")
        if episode:
            obj = next((s for s in episode["shots"] if s["id"] == target), None)
        else:
            obj = next((a for a in project["assets"] if a["id"] == target), None)
        if not obj:
            raise ValueError("Shot or asset does not exist in the selected project/episode")
        return obj
