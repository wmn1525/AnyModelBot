import { html, mount, useBot, useEffect, useRef, useState, Page, Button, Field, Notice, Empty } from "/amb/botapp/kit/kit.js";
import { STYLES } from "./styles.js";

const TABS = ["script", "storyboard", "assets", "canvas", "exports", "jobs", "settings"];
const types = ["character", "scene", "prop", "material", "voice", "image", "video", "audio"];
const activeMedia = (o, k) => (o.media?.[k] || []).find((m) => m.id === o.selectedMedia?.[k]) || o.media?.[k]?.at(-1);
const newId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function Select({ label, value, options, onChange }) {
  return html`<label class="kit-field"><span class="t-label">${label}</span><select class="field" value=${value} onChange=${(e) => onChange(e.target.value)}>${options.map(([id, title]) => html`<option value=${id}>${title}</option>`)}</select></label>`;
}
function Text({ label, value, onChange, rows = 5 }) {
  return html`<label><span class="t-label">${label}</span><textarea class="field" rows=${rows} value=${value} onInput=${(e) => onChange(e.target.value)} /></label>`;
}
function useDocument(bot, path, revision, fallback) {
  const [doc, set] = useState({ data: fallback || null, error: "" });
  useEffect(() => {
    let alive = true;
    if (bot.sample || !path) { set({ data: fallback || null, error: "" }); return; }
    set({ data: null, error: "" });
    bot.readFile(path).then((f) => {
      const data = f.json || JSON.parse(f.text);
      if (alive) set({ data, error: "" });
    }).catch((e) => alive && set({ data: null, error: String(e.message) }));
    return () => { alive = false; };
  }, [path, revision, bot.sample]);
  return doc;
}

function Preview({ bot, file, kind = "image" }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); setError(""); setUrl(""); }, [file]);
  useEffect(() => {
    if (!file || (kind !== "image" && !playing)) return;
    let alive = true, mediaUrl = "";
    if (bot.sample) { if (file.startsWith("./")) setUrl(file); return; }
    const request = kind === "image" ? bot.readImage(file) : bot.readMedia(file);
    request.then((r) => {
      if (kind !== "image") mediaUrl = r.url;
      if (alive) setUrl(r.url);
      else if (mediaUrl) bot.releaseMedia(mediaUrl).catch(() => {});
    }).catch(() => alive && setError(bot.t("previewError")));
    return () => { alive = false; if (mediaUrl) bot.releaseMedia(mediaUrl).catch(() => {}); };
  }, [file, kind, playing, bot.sample]);
  if (!file) return null;
  return html`<div class="pf-preview">
    ${url && (kind === "image" ? html`<img src=${url} alt=${bot.t("preview")} loading="lazy" />` : kind === "audio" ? html`<audio src=${url} controls preload="metadata" />` : html`<video src=${url} controls preload="metadata" playsinline />`)}
    ${kind !== "image" && html`<${Button} onClick=${() => { setPlaying(!playing); if (playing) setUrl(""); }}>${bot.t(playing ? "closePreview" : "preview")}<//>`}
    ${error && html`<p class="pf-error">${error}</p>`}
    ${!bot.sample && html`<${Button} onClick=${() => bot.openFile(file).catch((e) => setError(e.message))}>${bot.t("download")}<//>`}
  </div>`;
}

function NewProject({ bot, send, close }) {
  const [form, set] = useState({ kind: "short", title: "", source: "" });
  const edit = (k, v) => set((x) => ({ ...x, [k]: v }));
  return html`<section class="pf-card pf-form"><h2 class="t-title">${bot.t("newProject")}</h2>
    <${Select} label=${bot.t("kind")} value=${form.kind} options=${["short", "drama", "canvas"].map((k) => [k, bot.t(`kind.${k}`)])} onChange=${(v) => edit("kind", v)} />
    <${Field} label=${bot.t("title")} value=${form.title} onInput=${(e) => edit("title", e.target.value)} />
    <${Text} label=${bot.t("source")} value=${form.source} onChange=${(v) => edit("source", v)} />
    <div class="pf-actions"><${Button} primary disabled=${bot.busy || !form.title.trim()} onClick=${() => send("create", { ...form, settings: { language: bot.lang } })}>${bot.t("create")}<//><${Button} onClick=${close}>${bot.t("close")}<//></div>
  </section>`;
}

function Script({ bot, project: p, episode: ep, send }) {
  const [source, setSource] = useState(p.source);
  const [body, setBody] = useState(ep?.content || "");
  const [title, setTitle] = useState(ep?.title || "");
  const [summary, setSummary] = useState(ep?.summary || "");
  return html`<div class="pf-columns">
    <section class="pf-card pf-form"><h2 class="t-title">${bot.t("story")}</h2>
      <${Text} label=${bot.t("source")} value=${source} onChange=${setSource} />
      <${Button} disabled=${bot.busy} onClick=${() => send("apply", { source })}>${bot.t("save")}<//>
      <div class="pf-actions">${["summary", "outline", "scripts", "extractAssets"].map((action) => html`<${Button} disabled=${bot.busy} onClick=${() => send(action)}>${bot.t(action)}<//>`)}</div>
      ${Object.entries(p.summary || {}).filter(([, v]) => typeof v === "string").map(([k, v]) => html`<p class="pf-script">${v}</p>`)}
    </section>
    <section class="pf-card pf-form"><h2 class="t-title">${bot.t("episode")}</h2>
      ${ep ? html`<${Field} label=${bot.t("title")} value=${title} onInput=${(e) => setTitle(e.target.value)} />
        <${Text} label=${bot.t("episodeSummary")} value=${summary} onChange=${setSummary} rows=${3} />
        <${Text} label=${bot.t("screenplay")} value=${body} onChange=${setBody} rows=${16} />
        <div class="pf-actions"><${Button} disabled=${bot.busy} onClick=${() => send("apply", { episode: { title, content: body, summary } })}>${bot.t("save")}<//>
        ${["script", "optimize", "storyboard"].map((action) => html`<${Button} disabled=${bot.busy} onClick=${() => send(action)}>${bot.t(action)}<//>`)}</div>` : html`<${Empty}>${bot.t("noEpisode")}<//>`}
    </section>
  </div>`;
}

function TakePicker({ bot, obj, kind, send }) {
  const versions = obj.media?.[kind] || [];
  if (versions.length < 2) return null;
  return html`<${Select} label=${bot.t("takes")} value=${activeMedia(obj, kind)?.id || ""} options=${versions.map((v, i) => [v.id, `${i + 1} · ${v.model} · ${v.at}`])} onChange=${(id) => send("select-media", { target: obj.id, kind, id })} />`;
}

function Shot({ bot, shot: s, project: p, episode: ep, index, send }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: s.title, narration: s.narration, visualPrompt: s.visualPrompt, videoPrompt: s.videoPrompt, segmentScript: s.segmentScript, duration: s.duration, assetIds: s.assetIds });
  const change = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const move = (delta) => {
    const ids = ep.shots.map((s) => s.id), at = index + delta;
    [ids[index], ids[at]] = [ids[at], ids[index]];
    send("apply", { order: ids });
  };
  return html`<article class="pf-card"><header class="pf-shot-head"><h3 class="t-label">${index + 1}. ${s.title || bot.t("shot")} · ${s.duration}s</h3><span class="pf-meta">${s.locked ? bot.t("locked") : ""}</span></header>
    <${Preview} bot=${bot} file=${activeMedia(s, "image")?.path} />
    <p>${s.narration}</p>
    ${activeMedia(s, "video") && html`<${Preview} bot=${bot} kind="video" file=${activeMedia(s, "video").path} />`}
    ${activeMedia(s, "audio") && html`<${Preview} bot=${bot} kind="audio" file=${activeMedia(s, "audio").path} />`}
    <div class="pf-actions"><${Button} onClick=${() => setEditing(!editing)}>${bot.t("edit")}<//>
      ${["image", "video", "voice"].map((action) => html`<${Button} disabled=${bot.busy || s.locked} onClick=${() => send(action, { target: s.id, regenerate: true })}>${bot.t(`generate.${action}`)}<//>`)}
      <${Button} disabled=${bot.busy} onClick=${() => send("apply", { shots: [{ id: s.id, locked: !s.locked }] })}>${bot.t(s.locked ? "unlock" : "lock")}<//>
      <${Button} disabled=${bot.busy || index === 0} onClick=${() => move(-1)}>${bot.t("earlier")}<//>
      <${Button} disabled=${bot.busy || index === ep.shots.length - 1} onClick=${() => move(1)}>${bot.t("later")}<//>
    </div>
    ${editing && html`<div class="pf-form">
      <${Field} label=${bot.t("title")} value=${draft.title} onInput=${(e) => change("title", e.target.value)} />
      <${Field} label=${bot.t("duration")} type="number" value=${draft.duration} onInput=${(e) => change("duration", Number(e.target.value))} />
      ${["narration", "visualPrompt", "videoPrompt", "segmentScript"].map((k) => html`<${Text} label=${bot.t(k)} value=${draft[k]} onChange=${(v) => change(k, v)} />`)}
      <span class="t-label">${bot.t("references")}</span>
      ${p.assets.map((a) => html`<label><span><input type="checkbox" checked=${draft.assetIds.includes(a.id)} onChange=${(e) => change("assetIds", e.target.checked ? [...draft.assetIds, a.id] : draft.assetIds.filter((id) => id !== a.id))} /> ${a.name}</span></label>`)}
      <${Button} disabled=${bot.busy || s.locked} onClick=${() => send("apply", { shots: [{ id: s.id, ...draft }] })}>${bot.t("save")}<//>
      ${["image", "video", "audio"].map((k) => html`<${TakePicker} bot=${bot} obj=${s} kind=${k} send=${send} />`)}
      <${Button} disabled=${bot.busy} onClick=${async () => { const files = await bot.pickFile({ accept: "image/*,video/*,audio/*", multiple: true }); if (files.length) send("importMedia", { target: s.id, files }); }}>${bot.t("importMedia")}<//>
      <${Button} disabled=${bot.busy || s.locked} onClick=${() => send("apply", { removeShot: s.id })}>${bot.t("removeShot")}<//>
    </div>`}
  </article>`;
}

function Storyboard({ bot, project, episode, send }) {
  return html`<div class="pf-stack"><div class="pf-actions">
    ${["storyboard", "images", "videos", "voices", "resume", "compose"].map((a) => html`<${Button} disabled=${bot.busy || !episode} onClick=${() => send(a)}>${bot.t(a)}<//>`)}
    <${Button} disabled=${bot.busy || !episode} onClick=${() => send("apply", { shots: [{ title: bot.t("shot"), duration: 8 }] })}>${bot.t("addShot")}<//>
  </div><div class="pf-grid">${episode?.shots?.map((s, i) => html`<${Shot} key=${`${s.id}:${episode.revision}`} bot=${bot} shot=${s} index=${i} project=${project} episode=${episode} send=${send} />`)}</div>
  ${!episode?.shots?.length && html`<${Empty}>${bot.t("noShots")}<//>`}</div>`;
}

function AssetEditor({ bot, asset, send }) {
  const [draft, set] = useState(asset || { type: "character", name: "", prompt: "", voice: "" });
  const change = (k, v) => set((s) => ({ ...s, [k]: v }));
  return html`<div class="pf-form">
    <${Select} label=${bot.t("kind")} value=${draft.type} options=${types.map((k) => [k, bot.t(`asset.${k}`)])} onChange=${(v) => change("type", v)} />
    <${Field} label=${bot.t("name")} value=${draft.name} onInput=${(e) => change("name", e.target.value)} />
    <${Text} label=${bot.t("description")} value=${draft.prompt} onChange=${(v) => change("prompt", v)} />
    <${Field} label=${bot.t("voiceId")} value=${draft.voice} onInput=${(e) => change("voice", e.target.value)} />
    <${Button} disabled=${bot.busy || !draft.name} onClick=${() => send("apply", { assets: [{ ...(asset ? { id: asset.id } : {}), type: draft.type, name: draft.name, prompt: draft.prompt, voice: draft.voice }] }, false)}>${bot.t("save")}<//>
  </div>`;
}

function Assets({ bot, project: p, send }) {
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState("");
  const [library, setLibrary] = useState(null);
  return html`<div class="pf-stack"><div class="pf-actions">
    <${Button} onClick=${() => setEdit(edit === "new" ? "" : "new")}>${bot.t("addAsset")}<//>
    <${Button} disabled=${bot.busy} onClick=${() => send("extractAssets", {}, false)}>${bot.t("extractAssets")}<//>
    <${Button} disabled=${bot.sample} onClick=${() => bot.readFile("app/printfilm/library.json").then((f) => setLibrary(f.json || JSON.parse(f.text))).catch(() => setLibrary({ assets: [] }))}>${bot.t("library")}<//>
    <${Select} label=${bot.t("filter")} value=${filter} options=${[["", bot.t("all")], ...types.map((k) => [k, bot.t(`asset.${k}`)])]} onChange=${setFilter} />
  </div>
  ${edit === "new" && html`<section class="pf-card"><${AssetEditor} bot=${bot} send=${send} /></section>`}
  ${library && html`<section class="pf-card"><h2 class="t-label">${bot.t("library")}</h2>${library.assets.map((a) => html`<${Button} disabled=${bot.busy} onClick=${() => send("library", { action: "import", id: a.libraryId }, false)}>${a.name} · ${bot.t("import")}<//>`)}${!library.assets.length && bot.t("empty")}</section>`}
  <div class="pf-grid">${p.assets.filter((a) => !filter || a.type === filter).map((a) => html`<article class="pf-card" key=${a.id}>
    <h3 class="t-title">${a.name}</h3><span class="pf-meta">${bot.t(`asset.${a.type}`)}</span><p>${a.prompt}</p>
    ${["image", "video", "audio"].map((k) => html`<${Preview} bot=${bot} kind=${k} file=${activeMedia(a, k)?.path} />`)}
    <div class="pf-actions"><${Button} onClick=${() => setEdit(edit === a.id ? "" : a.id)}>${bot.t("edit")}<//>
      ${["image", "video", "voice"].map((k) => html`<${Button} disabled=${bot.busy} onClick=${() => send(k, { target: a.id, regenerate: true }, false)}>${bot.t(`generate.${k}`)}<//>`)}
      <${Button} disabled=${bot.busy} onClick=${async () => { const files = await bot.pickFile({ accept: "image/*,video/*,audio/*", multiple: true }); if (files.length) send("importMedia", { target: a.id, files }, false); }}>${bot.t("importMedia")}<//>
      <${Button} disabled=${bot.busy} onClick=${() => send("library", { action: "publish", target: a.id }, false)}>${bot.t("toLibrary")}<//>
    </div>${edit === a.id && html`<${AssetEditor} key=${`${a.id}:${p.revision}`} bot=${bot} asset=${a} send=${send} />`}
    ${["image", "video", "audio"].map((k) => html`<${TakePicker} bot=${bot} obj=${a} kind=${k} send=${(a, d) => send(a, d, false)} />`)}
  </article>`)}</div></div>`;
}

function Canvas({ bot, project: p, episode: ep, send }) {
  const [canvas, set] = useState(p.canvas);
  const [selected, setSelected] = useState("");
  const [linkFrom, setLinkFrom] = useState("");
  const drag = useRef(null);
  const add = (label, ref) => set((c) => ({ ...c, nodes: [...c.nodes, { id: newId(), label, x: 30 + (c.nodes.length % 5) * 220, y: 40 + Math.floor(c.nodes.length / 5) * 150, ...ref }] }));
  const pointerDown = (e, n) => {
    setSelected(n.id);
    if (linkFrom && linkFrom !== n.id) {
      set((c) => ({ ...c, edges: [...c.edges.filter((x) => !(x.from === linkFrom && x.to === n.id)), { from: linkFrom, to: n.id }] }));
      setLinkFrom(""); return;
    }
    drag.current = { id: n.id, x: e.clientX, y: e.clientY, ox: n.x, oy: n.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    set((c) => ({ ...c, nodes: c.nodes.map((n) => n.id === d.id ? { ...n, x: Math.max(0, Math.min(1200, d.ox + e.clientX - d.x)), y: Math.max(0, Math.min(800, d.oy + e.clientY - d.y)) } : n) }));
  };
  return html`<div class="pf-stack"><p class="pf-meta">${bot.t("canvasHelp")}</p><div class="pf-actions">
    <${Button} disabled=${bot.busy} onClick=${() => send("apply", { canvas })}>${bot.t("saveCanvas")}<//>
    <${Button} disabled=${!selected} onClick=${() => setLinkFrom(selected)}>${bot.t(linkFrom ? "pickTarget" : "connect")}<//>
    <${Button} disabled=${!selected} onClick=${() => { set((c) => ({ nodes: c.nodes.filter((n) => n.id !== selected), edges: c.edges.filter((e) => e.from !== selected && e.to !== selected) })); setSelected(""); }}>${bot.t("removeNode")}<//>
    <${Button} disabled=${bot.busy} onClick=${() => send("runCanvas", { canvas })}>${bot.t("runCanvas")}<//>
  </div><div class="pf-actions">
    ${p.assets.map((a) => html`<${Button} onClick=${() => add(a.name, { assetId: a.id })}>+ ${a.name}<//>`)}
    ${ep?.shots?.map((s, i) => html`<${Button} onClick=${() => add(`${i + 1}. ${s.title}`, { episodeId: ep.id, shotId: s.id })}>+ ${i + 1}<//>`)}
  </div><div class="pf-canvas-scroll"><div class="pf-canvas">
    <svg aria-hidden="true">${canvas.edges.map((e) => { const a = canvas.nodes.find((n) => n.id === e.from), b = canvas.nodes.find((n) => n.id === e.to); return a && b && html`<line x1=${a.x + 180} y1=${a.y + 40} x2=${b.x} y2=${b.y + 40} />`; })}</svg>
    ${canvas.nodes.map((n) => html`<button type="button" class="pf-node" aria-pressed=${selected === n.id} style=${{ left: `${n.x}px`, top: `${n.y}px` }} onPointerDown=${(e) => pointerDown(e, n)} onPointerMove=${pointerMove} onPointerUp=${() => { drag.current = null; }} onPointerCancel=${() => { drag.current = null; }} onKeyDown=${(e) => {
      const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
      if (d) { e.preventDefault(); set((c) => ({ ...c, nodes: c.nodes.map((a) => a.id === n.id ? { ...a, x: Math.max(0, a.x + d[0]), y: Math.max(0, a.y + d[1]) } : a) })); }
    }}>${n.label}<small>${n.assetId ? bot.t("asset") : bot.t("shot")}</small></button>`)}
  </div></div></div>`;
}

function Settings({ bot, project: p, send }) {
  const [form, set] = useState(p.settings);
  const edit = (k, v) => set((d) => ({ ...d, [k]: v }));
  return html`<section class="pf-card pf-form"><div class="pf-grid">
    <${Select} label=${bot.t("mode")} value=${form.mode} options=${["video", "image_text"].map((k) => [k, bot.t(`mode.${k}`)])} onChange=${(v) => { edit("mode", v); if (v === "image_text" && form.audioMode === "native") edit("audioMode", "tts"); }} />
    <${Select} label=${bot.t("ratio")} value=${form.ratio} options=${["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"].map((v) => [v, v])} onChange=${(v) => edit("ratio", v)} />
    <${Select} label=${bot.t("resolution")} value=${form.resolution} options=${["480p", "720p", "768p", "1080p"].map((v) => [v, v])} onChange=${(v) => edit("resolution", v)} />
    <${Select} label=${bot.t("style")} value=${form.style} options=${STYLES.map(([id]) => [id, bot.t(`style.${id}`)])} onChange=${(v) => edit("style", v)} />
    <${Select} label=${bot.t("audioMode")} value=${form.audioMode} options=${["native", "tts", "silent"].map((k) => [k, bot.t(`audio.${k}`)])} onChange=${(v) => edit("audioMode", v)} />
    ${["voice", "imageModel", "videoModel", "language"].map((k) => html`<${Field} label=${bot.t(k)} value=${form[k]} onInput=${(e) => edit(k, e.target.value)} />`)}
    ${["targetDuration", "episodeCount", "bgmVolume"].map((k) => html`<${Field} label=${bot.t(k)} type="number" value=${form[k]} onInput=${(e) => edit(k, Number(e.target.value))} />`)}
    <label><span><input type="checkbox" checked=${form.subtitles} onChange=${(e) => edit("subtitles", e.target.checked)} /> ${bot.t("subtitles")}</span></label>
  </div><div class="pf-actions"><${Button} disabled=${bot.busy} onClick=${async () => { const files = await bot.pickFile({ accept: "audio/*" }); if (files.length) edit("bgm", files[0].path); }}>${bot.t("chooseBgm")}<//>
    ${form.bgm && html`<${Button} onClick=${() => edit("bgm", "")}>${bot.t("clearBgm")}<//>`}
    <${Button} primary disabled=${bot.busy} onClick=${() => send("apply", { settings: form }, false)}>${bot.t("save")}<//>
    <${Button} disabled=${bot.busy} onClick=${() => send("models", {}, false)}>${bot.t("models")}<//>
    <${Button} disabled=${bot.busy} onClick=${() => send("doctor", {}, false)}>${bot.t("doctor")}<//>
    <${Button} disabled=${bot.busy} onClick=${() => send("apply", { archived: !p.archived }, false)}>${bot.t(p.archived ? "unarchive" : "archive")}<//>
  </div></section>`;
}

function Jobs({ bot, project: p, send }) {
  return html`<div class="pf-columns"><section class="pf-card"><h2 class="t-title">${bot.t("jobs")}</h2><div class="pf-list">
    ${p.jobs.slice().reverse().map((j) => html`<article><strong>${bot.t(`media.${j.kind}`)} · ${bot.t(`status.${j.status}`)}</strong><p class="pf-meta">${j.model} · ${j.updatedAt}</p>${j.error && html`<p class="pf-error">${j.error}</p>`}${j.estimateUsd != null && html`<p>${bot.t("estimate")}: $${j.estimateUsd}</p>`}
      ${["running", "interrupted"].includes(j.status) && html`<${Button} disabled=${bot.busy} onClick=${() => send("resume", { jobId: j.id }, false)}>${bot.t("resume")}<//>`}</article>`)}
    ${!p.jobs.length && bot.t("empty")}</div></section>
    <section class="pf-card"><h2 class="t-title">${bot.t("history")}</h2><div class="pf-list">${p.history.slice().reverse().map((h) => html`<article><p>${h.label}</p><p class="pf-meta">${h.at}</p><${Button} disabled=${bot.busy} onClick=${() => send("restore", { id: h.id }, false)}>${bot.t("restore")}<//></article>`)}</div></section></div>`;
}

function Exports({ bot, project: p, send }) {
  return html`<div class="pf-stack"><div class="pf-actions"><${Button} disabled=${bot.busy} onClick=${() => send("compose")}>${bot.t("compose")}<//><${Button} disabled=${bot.busy} onClick=${() => send("composeAll", {}, false)}>${bot.t("composeAll")}<//><${Button} disabled=${bot.busy} onClick=${() => send("export", {}, false)}>${bot.t("exportProject")}<//></div>
    <div class="pf-grid">${p.exports.slice().reverse().map((e) => html`<article class="pf-card"><h3 class="t-label">${e.at}</h3>
      ${e.kind === "video" ? html`<${Preview} bot=${bot} kind="video" file=${e.path} />` : html`<${Button} onClick=${() => bot.openFile(e.path)}>${bot.t("download")}<//>`}
      ${e.subtitlePath && html`<${Button} onClick=${() => bot.openFile(e.subtitlePath)}>${bot.t("downloadSubtitles")}<//>`}
      ${e.timelinePath && html`<${Button} onClick=${() => bot.openFile(e.timelinePath)}>${bot.t("downloadTimeline")}<//>`}
    </article>`)}</div>${!p.exports.length && html`<${Empty}>${bot.t("noExports")}<//>`}</div>`;
}

function App() {
  const liveBot = useBot();
  const bot = { ...liveBot, sample: liveBot.sample || !!liveBot.state?.sample };
  const [selected, setSelected] = useState("");
  const [episodeId, setEpisode] = useState("");
  const [tab, setTab] = useState("storyboard");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  const state = bot.state || {};
  const projects = state.projects || [];
  const descriptor = projects.find((p) => p.id === selected) || projects.find((p) => p.id === state.selectedProjectId) || projects[0];
  const projectDoc = useDocument(bot, descriptor?.path, descriptor?.revision, state.sampleProject);
  const p = projectDoc.data;
  const epDesc = p?.episodes?.find((e) => e.id === episodeId) || p?.episodes?.[0];
  const epDoc = useDocument(bot, epDesc?.path, epDesc?.revision, state.sampleEpisode);
  const ep = epDoc.data;
  if (!bot.ready) return null;
  const send = (action, data = {}, useEpisode = true) => {
    setError("");
    const payload = { type: action, projectId: bot.sample ? "" : p?.id || "", episodeId: bot.sample || !useEpisode ? "" : ep?.id || "", revision: p?.revision, data };
    bot.send(bot.t(`action.${action}`), payload).catch((e) => setError(e.message));
  };
  return html`<${Page} title=${bot.t("appTitle")} sub=${bot.t("appSub")} actions=${html`<${Button} onClick=${() => setCreating(!creating)}>${bot.t("newProject")}<//>`}>
    <div class="pf-shell">
      ${(error || projectDoc.error || epDoc.error) && html`<${Notice}>${error || projectDoc.error || epDoc.error}<//>`}
      ${bot.sample && html`<${Notice}>${bot.t("sample")}<//>`}
      ${creating && html`<${NewProject} bot=${bot} send=${send} close=${() => setCreating(false)} />`}
      <div class="pf-toolbar"><${Select} label=${bot.t("project")} value=${descriptor?.id || ""} options=${projects.filter((p) => archived || !p.archived).map((p) => [p.id, p.title])} onChange=${(id) => { setSelected(id); setEpisode(""); }} />
        <label><input type="checkbox" checked=${archived} onChange=${(e) => setArchived(e.target.checked)} /> ${bot.t("showArchived")}</label>
        <${Button} disabled=${!bot.busy} onClick=${() => bot.stop().catch((e) => setError(e.message))}>${bot.t("stop")}<//>
      </div>
      ${p ? html`<div class="pf-summary">${[[p.episodes.length, "episodes"], [p.assets.length, "assets"], [p.exports.length, "exports"]].map(([n, k]) => html`<div class="pf-stat"><strong>${n}</strong><span class="pf-meta">${bot.t(k)}</span></div>`)}</div>
        <div class="pf-toolbar"><${Select} label=${bot.t("episode")} value=${epDesc?.id || ""} options=${p.episodes.map((e) => [e.id, `${e.number}. ${e.title}`])} onChange=${setEpisode} />
          <${Button} disabled=${bot.busy} onClick=${() => send("apply", { episode: { number: Math.max(0, ...p.episodes.map((e) => e.number)) + 1, title: bot.t("newEpisode") } }, false)}>${bot.t("newEpisode")}<//>
        </div>
        <nav class="pf-tabs" role="tablist">${TABS.map((id) => html`<button type="button" class="btn" role="tab" aria-selected=${tab === id} onClick=${() => setTab(id)}>${bot.t(id === "storyboard" ? "tab.storyboard" : id)}</button>`)}</nav>
        <section role="tabpanel">
          ${tab === "script" && html`<${Script} key=${`${p.id}:${p.revision}:${ep?.id}`} bot=${bot} project=${p} episode=${ep} send=${send} />`}
          ${tab === "storyboard" && html`<${Storyboard} bot=${bot} project=${p} episode=${ep} send=${send} />`}
          ${tab === "assets" && html`<${Assets} bot=${bot} project=${p} send=${send} />`}
          ${tab === "canvas" && html`<${Canvas} key=${`${p.id}:${p.revision}`} bot=${bot} project=${p} episode=${ep} send=${send} />`}
          ${tab === "settings" && html`<${Settings} key=${`${p.id}:${p.revision}`} bot=${bot} project=${p} send=${send} />`}
          ${tab === "jobs" && html`<${Jobs} bot=${bot} project=${p} send=${send} />`}
          ${tab === "exports" && html`<${Exports} bot=${bot} project=${p} send=${send} />`}
        </section>` : !creating && html`<${Empty}>${bot.t("noProjects")}<//>`}
    </div>
  <//>`;
}
mount(App);
