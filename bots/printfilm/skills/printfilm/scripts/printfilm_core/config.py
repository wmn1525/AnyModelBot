"""Local configuration adapter for the vendored PRINTFILM composer."""
from types import SimpleNamespace


def get_settings():
    return SimpleNamespace(ffmpeg_path="ffmpeg", ffprobe_path="ffprobe")
