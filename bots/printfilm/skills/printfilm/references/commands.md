# Runner payloads

Run from the workspace. `--input` is a JSON file inside it; `--input -` accepts stdin. Inspect IDs after creation; never infer IDs from list position. Commands return `{ok,result}`. Mutation errors exit nonzero and must be surfaced.

`create`:

```json
{"kind":"drama","title":"Moonlight Post Office","source":"A fox delivers letters.","settings":{"episodeCount":3,"language":"en","ratio":"16:9","mode":"video"}}
```

Kinds: `short`, `drama`, `canvas`. Settings: `mode` (`video` / `image_text`), `ratio` (9:16, 16:9, 1:1, 4:3, 3:4, 21:9), `resolution` (480p, 720p, 768p, 1080p), `style`, `audioMode` (native / tts / silent), `voice`, `subtitles`, `imageModel`, `videoModel`, `bgm` (workspace file), `bgmVolume` (0–1), `targetDuration`, `episodeCount` (1–120), `language`. Output settings don't establish what a particular AI model supports; read its docs.

`apply --project ID` creates a new episode when `episode` is present and `--episode` is absent. Add `--episode ID` to edit an existing one. It patches only the specified fields:

```json
{
  "revision":1,
  "summary":{"seriesTitle":"Moonlight Post Office","synopsis":"…","characters":[]},
  "assets":[{"id":"fox","type":"character","name":"Fox","prompt":"Orange fur, blue coat","voice":"en-US-AriaNeural"}],
  "episode":{"number":1,"title":"The letter","summary":"…","content":"…"},
  "shots":[{"id":"opening","title":"Post office","duration":8,"narration":"The final letter waited.","visualPrompt":"…","videoPrompt":"…","segmentScript":"…","assetIds":["fox"],"dialogue":[],"locked":false}]
}
```

Asset types: character, scene, prop, material, voice, image, video, audio. `assetIds` on a shot identify reference assets. `dialogue` is `[{speaker,text,voice?}]`. IDs are optional for new objects; supply explicit stable IDs when linking objects in the same edit. Omitted shot fields retain their previous values and media versions. `order:[all shot IDs exactly once]` reorders an episode. `removeShot:ID` removes an unlocked shot; history retains it. `archived:true` hides a project without deleting media. `label` is an optional readable history description.

Canvas payload:

```json
{"canvas":{"nodes":[{"id":"a","assetId":"fox","label":"Fox","x":40,"y":40},{"id":"b","episodeId":"EPISODE_ID","shotId":"opening","label":"Opening","x":360,"y":40}],"edges":[{"from":"a","to":"b"}]}}
```

`canvas-plan --project ID` returns ordered nodes and selected reference media; cyclic graphs fail. A graph node references either an asset or a shot in an episode.

`prompt --project ID [--episode ID]` accepts `{task,target?}`. Tasks: summary, outline, script, optimize, episode-summary, storyboard, short-video, asset, image, video. This returns instructions and context, not generated content. The host model writes the result and saves it with `apply`.

`job --project ID [--episode ID]`:

```json
{"action":"begin","target":"opening","kind":"video","model":"MODEL_FROM_MEDIA_MODELS","estimateUsd":0.5}
```

Record the returned `job.id` and `job.requestId`. Call `job` with `{action:"request",id:JOB_ID,request:{prompt,model,body}}` to persist the exact native tool arguments. The returned `arguments` includes the durable request_id; `job.requestPath` identifies the saved file. These arguments cannot be overwritten with a different request. The same pending operation is reused by `begin`; `newTake:true` explicitly starts another take. To mark an error or local interruption use `{action:"failed"|"interrupted"|"cancelled"|"running",id,error}`. `done` can only be achieved by binding an actual validated media file.

`bind --project ID [--episode ID]`:

```json
{"target":"opening","kind":"video","path":"media/video-actual-output.mp4","model":"MODEL_ID","jobId":"JOB_ID"}
```

`kind`: image/video/audio. Omit jobId for user imports. `costUsd` is optional actual cost, never an estimate. Invalid media, changed job inputs, cross-project targets and paths outside the workspace are rejected. Bound media versions are copied to unique project paths.

`select-media` takes `{target,kind,id}` with the version ID. `plan` lists ready, missing/stale and pending operations. `voice` takes `{target}`; the current narration/dialogue or voice-asset description is spoken. `voices` lists available Edge voice IDs; `setup` installs its optional worker into the workspace. `doctor` checks FFmpeg/ffprobe/font availability.

`compose --project ID --episode ID` accepts optional `{shotIds:[...]}` for an ordered subset, otherwise all shots. The result contains `path`, `subtitlePath`, `timelinePath`, actual duration and source revision. It does not create missing media or downgrade missing video to still images. `export --project ID` returns the project archive path.

`library --project ID` uses `{action:"publish",target:ASSET_ID}`, `{action:"import",id:LIBRARY_ID}` or `{action:"list"}`. `restore` uses `{id:HISTORY_ID}`. `inspect` returns the authoritative documents; `sync` rebuilds the UI index from them.
