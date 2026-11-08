"""Observable workflow tests for PRINTFILM's local runtime and imported compositor."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bots/printfilm/skills/printfilm/scripts"))
from pf_store import Store
from pf import apply, archive_export, bind, canvas_plan, create, job, library, plan, prompt, restore, select_media
from pf_produce import compose


class Runtime(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name)
        self.pid = create(self.store, {"title": "A complete story", "kind": "drama", "settings": {"audioMode": "silent", "resolution": "480p"}})["projectId"]
        self.eid = apply(self.store, self.project(), None, {"episode": {"number": 1, "title": "Arrival", "content": "Fox arrives."}, "assets": [{"id": "fox", "name": "Fox", "type": "character", "prompt": "A fox"}], "shots": [{"id": "shot-a", "duration": 0.4, "visualPrompt": "A fox arrives", "videoPrompt": "Fox walks", "assetIds": ["fox"]}]})["episodeId"]

    def project(self):
        return self.store.project(self.pid)

    def episode(self):
        return self.store.episode(self.project(), self.eid)

    def edit(self, data):
        return apply(self.store, self.project(), self.episode(), data)

    def fixture(self, kind):
        name = f"fixture-{kind}." + {"image": "png", "video": "mp4", "audio": "wav"}[kind]
        p = Path(self.tmp.name) / name
        args = ["ffmpeg", "-v", "error", "-y", "-threads", "1"]
        if kind == "audio":
            args += ["-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", p]
        else:
            args += ["-f", "lavfi", "-i", "color=c=blue:s=128x128:d=0.4"]
            args += ["-frames:v", "1", "-threads", "1", p] if kind == "image" else ["-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", p]
        subprocess.run(args, check=True, capture_output=True)
        return name

    def attach(self, kind, target="shot-a", ep=True, **kwargs):
        return bind(self.store, self.project(), self.episode() if ep else None, {"target": target, "kind": kind, "path": self.fixture(kind), **kwargs})["media"]

    def test_episode_edits_history_and_revision_conflict(self):
        before = self.project()["revision"]
        self.edit({"revision": before, "episode": {"content": "Fox finds a letter."}})
        snapshot = self.project()["history"][-1]["id"]
        with self.assertRaisesRegex(ValueError, "Revision conflict"):
            self.edit({"revision": before, "episode": {"content": "stale write"}})
        self.assertEqual(self.episode()["content"], "Fox finds a letter.")
        restore(self.store, self.project(), {"id": snapshot})
        self.assertEqual(self.episode()["content"], "Fox arrives.")
        self.assertGreater(self.project()["revision"], before)

    def test_series_not_reduced_to_one_episode(self):
        for i in range(2, 5):
            apply(self.store, self.project(), None, {"episode": {"number": i, "title": str(i), "content": "Complete script " * 100}})
        self.assertEqual([e["number"] for e in self.project()["episodes"]], [1, 2, 3, 4])
        for e in self.project()["episodes"]:
            self.assertTrue(self.store.path(e["path"]).exists())
        with self.assertRaisesRegex(ValueError, "unique"):
            apply(self.store, self.project(), None, {"episode": {"number": 2}})
        with self.assertRaisesRegex(ValueError, "already exists"):
            apply(self.store, self.project(), None, {"episode": {"id": self.eid, "number": 1}})

    def test_project_history_restores_episode_versions_consistently(self):
        apply(self.store, self.project(), None, {"title": "New title"})
        snapshot = self.project()["history"][-1]["id"]
        self.edit({"episode": {"content": "This later revision must not leak into the restored snapshot."}})
        restore(self.store, self.project(), {"id": snapshot})
        self.assertEqual(self.project()["title"], "A complete story")
        self.assertEqual(self.episode()["content"], "Fox arrives.")

    def test_interrupted_commit_recovers_before_next_command(self):
        p = self.project()
        p["title"] = "Recovered transaction"
        p["revision"] += 1
        self.store.write("app/printfilm/pending.json", {"writes": {self.store.project_path(self.pid): p}})
        restarted = Store(self.tmp.name)
        with restarted.lock():
            self.assertEqual(restarted.project(self.pid)["title"], "Recovered transaction")
            self.assertFalse(restarted.path("app/printfilm/pending.json").exists())
            self.assertEqual(restarted.read("app/state.json")["projects"][0]["title"], "Recovered transaction")

    def test_partial_edit_preserves_shots_and_reordering(self):
        self.edit({"shots": [{"id": "shot-b", "duration": 5, "narration": "Hello"}]})
        self.edit({"shots": [{"id": "shot-a", "title": "Updated"}], "order": ["shot-b", "shot-a"]})
        self.assertEqual([s["id"] for s in self.episode()["shots"]], ["shot-b", "shot-a"])
        with self.assertRaisesRegex(ValueError, "every shot"):
            self.edit({"order": ["shot-a"]})
        self.edit({"shots": [{"id": "shot-a", "locked": True}]})
        with self.assertRaisesRegex(ValueError, "Unlock"):
            self.edit({"shots": [{"id": "shot-a", "videoPrompt": "Changed"}]})

    def test_invalid_edit_does_not_change_project(self):
        before = self.project()
        with self.assertRaises(ValueError):
            self.edit({"title": "Must not persist", "shots": [{"duration": float("nan")}]})
        self.assertEqual(self.project(), before)

    def test_generation_arguments_are_persisted_and_immutable(self):
        j = job(self.store, self.project(), self.episode(), {"kind": "video", "target": "shot-a", "model": "video-model"})["job"]
        result = job(self.store, self.project(), None, {"action": "request", "id": j["id"], "request": {"prompt": "Fox walks", "model": "video-model", "body": {"seconds": 4}}})
        self.assertEqual(result["arguments"]["request_id"], j["requestId"])
        self.assertEqual(self.store.read(result["job"]["requestPath"]), result["arguments"])
        with self.assertRaisesRegex(ValueError, "immutable"):
            job(self.store, self.project(), None, {"action": "request", "id": j["id"], "request": {"prompt": "Changed"}})

    def test_paths_cannot_escape_or_follow_links(self):
        for path in ["../outside", "/etc/passwd", "app/../../outside", "app\\outside", "C:/outside"]:
            with self.assertRaises(ValueError, msg=path):
                self.store.path(path)
        outside = Path(self.tmp.name).parent / (Path(self.tmp.name).name + "-outside")
        outside.write_text("private")
        self.addCleanup(lambda: outside.unlink())
        link = Path(self.tmp.name) / "linked"
        link.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "Symlinks"):
            self.store.path("linked", True)

    def test_canvas_dependencies_and_cycle_detection(self):
        canvas = {"nodes": [{"id": "a", "label": "Fox", "assetId": "fox"}, {"id": "b", "label": "Opening", "episodeId": self.eid, "shotId": "shot-a"}], "edges": [{"from": "a", "to": "b"}]}
        self.edit({"canvas": canvas})
        ordered = canvas_plan(self.store, self.project())["ordered"]
        self.assertEqual([e["node"]["id"] for e in ordered], ["a", "b"])
        self.assertEqual(ordered[1]["references"][0]["name"], "Fox")
        canvas["edges"].append({"from": "b", "to": "a"})
        self.edit({"canvas": canvas})
        with self.assertRaisesRegex(ValueError, "cycle"):
            canvas_plan(self.store, self.project())

    def test_upstream_writing_and_asset_prompts_are_executable(self):
        for task in ["summary", "outline", "script", "optimize", "episode-summary", "storyboard", "short-video"]:
            result = prompt(self.store, self.project(), self.episode(), {"task": task})
            self.assertGreater(len(result["system"]), 200, task)
            self.assertIn("HOST ADAPTATION", result["system"])
        result = prompt(self.store, self.project(), None, {"task": "asset", "target": "fox"})
        self.assertIn("三视图", result["system"])
        self.edit({"shots": [{"id": "shot-a", "segmentScript": "@duration:4\n空镜：邮局的窗户亮起灯光。"}]})
        video = prompt(self.store, self.project(), self.episode(), {"task": "video", "target": "shot-a", "model": "seedance-2-5"})
        self.assertIn("00:00-00:04", video["system"])
        self.assertNotIn("@duration:4", video["system"])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_media_versions_stale_detection_and_job_recovery(self):
        j = job(self.store, self.project(), self.episode(), {"action": "begin", "kind": "image", "target": "shot-a"})["job"]
        again = job(self.store, self.project(), self.episode(), {"kind": "image", "target": "shot-a"})
        self.assertTrue(again["reused"])
        self.assertEqual(again["job"]["requestId"], j["requestId"])
        first = self.attach("image", jobId=j["id"])
        self.assertEqual(self.project()["jobs"][-1]["status"], "done")
        self.assertTrue(any(r["kind"] == "image" for r in plan(self.store, self.project(), self.episode())["ready"]))
        second = self.attach("image")
        self.assertNotEqual(first["path"], second["path"])
        select_media(self.store, self.project(), self.episode(), {"target": "shot-a", "kind": "image", "id": first["id"]})
        self.assertEqual(self.store.active(self.episode()["shots"][0], "image")["id"], first["id"])
        self.edit({"shots": [{"id": "shot-a", "visualPrompt": "A new scene"}]})
        self.assertTrue(any(r["kind"] == "image" and r["reason"] == "stale" for r in plan(self.store, self.project(), self.episode())["pending"]))
        with self.assertRaises(ValueError):
            bind(self.store, self.project(), self.episode(), {"target": "shot-a", "kind": "image", "path": self.fixture("image"), "jobId": j["id"]})

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_assets_library_copies_and_validates_real_media(self):
        original = self.attach("image", "fox", False)
        lib = library(self.store, self.project(), {"action": "publish", "target": "fox"})
        library(self.store, self.project(), {"action": "import", "id": lib["assets"][0]["libraryId"]})
        copied = self.project()["assets"][-1]
        self.assertNotEqual(copied["id"], "fox")
        self.assertNotEqual(self.store.active(copied, "image")["path"], original["path"])
        fake = Path(self.tmp.name) / "fake.mp4"
        fake.write_text("this is not video")
        with self.assertRaises(ValueError):
            bind(self.store, self.project(), self.episode(), {"target": "shot-a", "kind": "video", "path": "fake.mp4"})

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_compose_real_video_and_stills_and_reject_missing_shots(self):
        with self.assertRaisesRegex(ValueError, "has no video"):
            compose(self.store, self.project(), self.episode(), {})
        self.attach("video")
        video = compose(self.store, self.project(), self.episode(), {})
        self.assertGreater(self.store.path(video["path"]).stat().st_size, 500)
        self.assertGreater(video["seconds"], 0.2)
        self.edit({"settings": {"mode": "image_text"}, "shots": [{"id": "shot-a", "narration": "Moonlight"}]})
        self.attach("image")
        stills = compose(self.store, self.project(), self.episode(), {})
        self.assertIn("Moonlight", self.store.path(stills["subtitlePath"]).read_text())
        self.assertEqual(len(self.project()["exports"]), 2)
        self.assertTrue(self.store.path(video["path"]).exists())
        bgm = self.fixture("audio")
        self.edit({"settings": {"bgm": bgm}})
        package = archive_export(self.store, self.project())
        with zipfile.ZipFile(self.store.path(package["path"])) as z:
            project = json.loads(z.read("project.json"))
            prefix = f"app/printfilm/projects/{self.pid}/"
            self.assertIn(project["settings"]["bgm"].removeprefix(prefix), z.namelist())
            self.assertIn(video["path"].removeprefix(prefix), z.namelist())
            self.assertTrue(any(name.startswith("history/") for name in z.namelist()))


if __name__ == "__main__":
    unittest.main()
