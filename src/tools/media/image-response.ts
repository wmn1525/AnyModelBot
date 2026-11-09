/** Decode JSON and SSE image responses without retrying billable requests. */
export function imagePayload(text: string): unknown {
  const input = text.replace(/^\uFEFF/, "").trim();
  if (!input) throw new Error("Empty image response");
  if (input.startsWith("{") || input.startsWith("[")) {
    const value = JSON.parse(input);
    if (value?.error || value?.success === false) throw new Error(value.error?.message || value.message || "Image generation failed");
    return value;
  }
  const frames = input.split(/\r?\n\r?\n/);
  const choices = new Map<number, { message: { content: unknown[]; images: unknown[] }; text: string }>();
  const data: unknown[] = [], candidates: unknown[] = [], output: unknown[] = [];
  let events = 0;
  for (const frame of frames) {
    const payload = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
    if (!payload || payload === "[DONE]") continue;
    const event = JSON.parse(payload) as any;
    events++;
    if (event.error || event.type === "error" || /[._]failed$/.test(event.type ?? "")) throw new Error(event.error?.message || event.message || "Image generation failed");
    if (Array.isArray(event.data)) data.push(...event.data);
    if (Array.isArray(event.candidates)) candidates.push(...event.candidates);
    if (Array.isArray(event.output)) output.push(...event.output);
    if (event.response?.output) output.push(...event.response.output);
    // Partial previews are not final deliverables.
    if (event.b64_json && !/partial/.test(event.type ?? "")) data.push({ b64_json: event.b64_json });
    for (const choice of event.choices ?? []) {
      const index = Number(choice.index) || 0;
      let current = choices.get(index);
      if (!current) { current = { message: { content: [], images: [] }, text: "" }; choices.set(index, current); }
      const message = choice.message ?? choice.delta;
      if (!message) continue;
      if (typeof message.content === "string") current.text += message.content;
      else if (Array.isArray(message.content)) current.message.content.push(...message.content);
      if (Array.isArray(message.images)) current.message.images.push(...message.images);
    }
  }
  if (!events) throw new Error("Image response is neither JSON nor SSE");
  return { data, candidates, output, choices: [...choices.values()].map(({ message, text }) => ({ message: { ...message, content: [...message.content, text] } })) };
}

/** Only inspect output fields; never mistake echoed input/reference images for results. */
export function imageSources(payload: unknown): string[] {
  const found = new Set<string>();
  const inline = (mime: unknown, data: unknown) => {
    if (typeof data === "string" && data.trim()) found.add(`data:${typeof mime === "string" ? mime : "image/png"};base64,${data.replace(/\s+/g, "")}`);
  };
  const text = (value: string) => {
    for (const match of value.matchAll(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+|!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)) found.add(match[1] ?? match[0]);
  };
  const walk = (value: unknown, image = false, depth = 0): void => {
    if (depth > 12 || value == null) return;
    if (typeof value === "string") { if (image && /^https:\/\//i.test(value)) found.add(value); else text(value); return; }
    if (Array.isArray(value)) { for (const item of value) walk(item, image, depth + 1); return; }
    if (typeof value !== "object") return;
    const item = value as Record<string, any>;
    if (item.b64_json) inline(item.mime_type ?? item.mimeType, item.b64_json);
    if (item.inlineData ?? item.inline_data) {
      const data = item.inlineData ?? item.inline_data; inline(data.mimeType ?? data.mime_type, data.data);
    }
    if (item.source?.type === "base64") inline(item.source.media_type, item.source.data);
    if (item.type === "image_generation_call" && item.status !== "in_progress") inline("image/png", item.result);
    if (item.image_url) walk(typeof item.image_url === "string" ? item.image_url : item.image_url.url, true, depth + 1);
    if (item.url && (image || item.type === "image" || item.type === "image_url")) walk(item.url, true, depth + 1);
    if (typeof item.text === "string") text(item.text);
    if (typeof item.content === "string") text(item.content);
    for (const key of ["choices", "message", "content", "parts", "candidates", "output"]) if (item[key] && typeof item[key] === "object") walk(item[key], false, depth + 1);
    for (const key of ["data", "images"]) if (item[key] && typeof item[key] === "object") walk(item[key], true, depth + 1);
  };
  walk(payload);
  return [...found];
}
