"""Optional Edge TTS worker; executed in the bot's local virtual environment."""
import argparse
import asyncio
import json
from pathlib import Path


async def run():
    import edge_tts
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--input")
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.list:
        print(json.dumps(await edge_tts.list_voices(), ensure_ascii=False))
        return
    root = Path.cwd().resolve()
    source, output = Path(args.input).resolve(), Path(args.output).resolve()
    if not source.is_relative_to(root) or not output.is_relative_to(root):
        raise ValueError("TTS files must stay in the bot workspace")
    data = json.loads(source.read_text(encoding="utf-8"))
    await edge_tts.Communicate(data["text"], data["voice"], rate=data.get("rate", "+0%")).save(str(output))
    print(json.dumps({"path": str(output)}))


if __name__ == "__main__":
    asyncio.run(run())
