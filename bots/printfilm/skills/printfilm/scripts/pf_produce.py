"""Local audio and film production using PRINTFILM's actual FFmpeg implementation."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import shutil
import tempfile

from pf_store import now, number, uid
from pf import HERE, bind, job, media_check, probe, process, tts_python
from printfilm_core import ffmpeg_compose as film


def voice(store, p, ep, data):
    obj = store.target(p, ep, data.get("target"))
    lines = obj.get("dialogue") or [{"text": obj.get("narration", obj.get("prompt", "")), "voice": obj.get("voice") or p["settings"]["voice"]}]
    lines = [line for line in lines if line["text"].strip()]
    if not lines:
        raise ValueError("No spoken text; visual directions must not be read aloud")
    j = job(store, p, ep, {"target": obj["id"], "kind": "audio", "model": "edge-tts"})["job"]
    # job committed a new project revision. Keep that record throughout production.
    p = store.project(p["id"])
    out = store.media_path(p["id"], "speech", ".mp3")
    try:
        with tempfile.TemporaryDirectory(prefix="voice-", dir=store.base) as td:
            segments = []
            for i, line in enumerate(lines):
                inp, clip = Path(td) / f"line-{i}.json", Path(td) / f"line-{i}.mp3"
                speaker = next((a for a in p["assets"] if a["type"] == "character" and a["name"] == line.get("speaker")), None)
                value = {"text": line["text"], "voice": line.get("voice") or (speaker or {}).get("voice") or p["settings"]["voice"]}
                inp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
                process([tts_python(store), HERE / "pf_voice.py", "--input", inp, "--output", clip], 180)
                media_check(clip, "audio")
                segments.append(clip)
            if len(segments) == 1:
                shutil.copyfile(segments[0], out)
            else:
                args = ["ffmpeg", "-v", "error", "-y"]
                for f in segments:
                    args += ["-i", f]
                graph = "".join(f"[{i}:a]" for i in range(len(segments))) + f"concat=n={len(segments)}:v=0:a=1[a]"
                process(args + ["-filter_complex", graph, "-map", "[a]", "-c:a", "libmp3lame", out])
        result = bind(store, p, ep, {"target": obj["id"], "kind": "audio", "path": store.relative(out), "jobId": j["id"], "model": "edge-tts"})
        out.unlink()
        return result
    except Exception as exc:
        job(store, store.project(p["id"]), ep, {"action": "failed", "id": j["id"], "error": str(exc)})
        raise


def timestamp(seconds):
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def compose(store, p, ep, data):
    if not ep or not ep["shots"]:
        raise ValueError("Select an episode with storyboard shots")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("FFmpeg and ffprobe are required; run doctor")
    temp_root = store.path("app/printfilm/tmp")
    temp_root.mkdir(parents=True, exist_ok=True)
    cfg = p["settings"]
    if cfg["subtitles"] and not film._find_cjk_font():
        raise ValueError("Install a font supporting the film's language before rendering subtitles")
    shot_ids = data.get("shotIds")
    selected = ep["shots"]
    if shot_ids is not None:
        if not isinstance(shot_ids, list) or len(set(shot_ids)) != len(shot_ids) or set(shot_ids) - {s["id"] for s in selected}:
            raise ValueError("Invalid ordered shot selection")
        selected = [next(s for s in selected if s["id"] == sid) for sid in shot_ids]
    if not selected:
        raise ValueError("No shots selected")
    inputs, timings, elapsed = [], [], 0.0
    for i, shot in enumerate(selected):
        kind = "image" if cfg["mode"] == "image_text" else "video"
        main = store.active(shot, kind)
        if not main:
            raise ValueError(f"Shot {shot['id']} has no {kind}; missing shots cannot become black frames")
        if not shot["locked"] and main.get("specHash") != store.signature(p, shot, kind):
            raise ValueError(f"Shot {shot['id']} has stale {kind}; regenerate or explicitly lock the chosen take")
        source = store.path(main["path"], True)
        media_check(source, kind)
        aud = store.active(shot, "audio")
        spoken = shot["narration"] or "\n".join(x["text"] for x in shot.get("dialogue", []))
        if cfg["audioMode"] == "tts" and spoken:
            if not aud or (not shot["locked"] and aud.get("specHash") != store.signature(p, shot, "audio")):
                raise ValueError(f"Shot {shot['id']} needs current narration audio")
        if kind == "video" and cfg["audioMode"] == "native" and spoken:
            if not any(s.get("codec_type") == "audio" for s in probe(source)["streams"]):
                raise ValueError(f"Shot {shot['id']} lacks native audio; generate narration or choose silent mode")
        duration = shot["duration"]
        audio_path = store.path(aud["path"], True) if aud and cfg["audioMode"] == "tts" else None
        if audio_path:
            duration = max(duration, media_check(audio_path, "audio"))
        inputs.append(film.ShotMedia(shot_no=i + 1, duration=duration, narration=spoken if cfg["subtitles"] else "",
                                    video_path=source if kind == "video" else None, audio_path=audio_path,
                                    image_path=source if kind == "image" else None))
        timings.append({"shotId": shot["id"], "start": elapsed, "end": elapsed + duration, "text": spoken})
        elapsed += duration
    if cfg["mode"] == "image_text" and cfg["audioMode"] == "native" and any(t["text"] for t in timings):
        raise ValueError("Still-image films need TTS or silent audio mode")
    output = store.path(f"app/printfilm/projects/{p['id']}/exports/{uid(ep['id'])}.mp4")
    output.parent.mkdir(parents=True, exist_ok=True)
    opts = film.ComposeOptions(ratio=cfg["ratio"], mode="image_text" if cfg["mode"] == "image_text" else "full",
                               prefer_video_audio=cfg["audioMode"] == "native", keep_video_sfx=cfg["audioMode"] == "tts",
                               bgm_path=store.path(cfg["bgm"], True) if cfg["bgm"] else None, bgm_volume=cfg["bgmVolume"])
    opts.resolution = cfg["resolution"]
    # Work on copies: upstream may adjust duration to match actual speech.
    original_temp = tempfile.tempdir
    try:
        tempfile.tempdir = str(temp_root)
        film.compose_project(copy.deepcopy(inputs), output, opts)
    finally:
        tempfile.tempdir = original_temp
    actual = media_check(output, "video")
    if abs(actual - elapsed) > max(1.5, elapsed * 0.03):
        raise ValueError(f"Rendered duration {actual:.2f}s differs from planned {elapsed:.2f}s")
    srt = output.with_suffix(".srt")
    captions = []
    for t in timings:
        if t["text"]:
            captions.append(f"{len(captions)+1}\n{timestamp(t['start'])} --> {timestamp(t['end'])}\n{t['text']}\n")
    srt.write_text("\n".join(captions), encoding="utf-8")
    timeline = output.with_suffix(".json")
    timeline.write_text(json.dumps({"projectId": p["id"], "episodeId": ep["id"], "revision": ep["revision"],
                                    "subtitleTiming": "shot-level", "shots": timings}, ensure_ascii=False, indent=2), encoding="utf-8")
    record = {"id": uid("export"), "kind": "video", "path": store.relative(output), "subtitlePath": store.relative(srt),
              "timelinePath": store.relative(timeline), "episodeId": ep["id"], "at": now(), "seconds": actual,
              "revision": ep["revision"], "shotIds": [s["id"] for s in selected]}
    ep["exports"].append(record)
    p["exports"].append(record)
    store.commit(p, "compose", ep)
    return record
