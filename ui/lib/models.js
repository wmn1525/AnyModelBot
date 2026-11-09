// 模型 ID 的显示与分组（不依赖界面，单元测试直接引入）。

/** 内置网关列出的模型带 "modelflare/" 前缀，OKINTO 直接列出的不带；两种写法都能调用，显示与比较时去掉它 */
export const normModel = (m) => (m && m.startsWith("modelflare/") ? m.slice("modelflare/".length) : m || "");
export const sameModel = (a, b) => !!a && !!b && normModel(a) === normModel(b);
export function playgroundSelection(id) {
  const match = normModel(id).match(/^(?:okinto|newapi)\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  try { return { group: decodeURIComponent(match[1]), model: match[2] }; } catch { return null; }
}
const decodeLabel = (value) => { try { return decodeURIComponent(value); } catch { return value; } };
export function displayModel(id) {
  const plain = String(id || "").replace(/^(?:modelflare|mfb-[\w-]+)\//i, "");
  const selected = playgroundSelection(plain);
  return selected ? decodeLabel(selected.model) + " · " + selected.group : decodeLabel(plain);
}
export const shortModel = (id) => {
  const label = displayModel(id);
  return playgroundSelection(id) ? label : label && label.includes("/") ? label.slice(label.lastIndexOf("/") + 1) : label;
};
/** Clean internal OKINTO IDs in historical activity text without rewriting URLs. */
export const displayModelText = (text) => String(text || "").replace(/(?<![\w:/])(?:(?:modelflare|mfb-[\w-]+)\/)?(?:Okinto|newapi)\/[^\s"'<>\uFF0C\u3002\uFF1B\uFF1A\u3001)]+/gi, (id) => displayModel(id));

/** 官方 API 的模型 id 是 official-<厂商>/<模型>（src/providers/official.ts）；这张表只管显示，test/official-providers.unit.test.ts 核对它和服务端的表一致 */
const OFFICIAL_NAMES = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  xai: "xAI",
  deepseek: "DeepSeek",
  "moonshot-cn": "Kimi",
  moonshot: "Kimi",
  zhipu: "GLM",
  zai: "GLM",
  "qwen-cn": "Qwen",
  qwen: "Qwen",
  "minimax-cn": "MiniMax",
  minimax: "MiniMax",
  mistral: "Mistral",
};
/** 官方 API 的模型是哪一家的；不是官方 API 的模型回空串 */
export const officialSource = (m) => {
  const x = /^official-([^/]+)\//.exec(m || "");
  return x ? OFFICIAL_NAMES[x[1]] || x[1] : "";
};

// —— 模型族：按名字认（OKINTO 的 ID 不带厂商前缀，如 gpt-6-sol、claude-opus-5-5）。数组顺序就是显示顺序，认不出的归 OTHER_FAMILY 放最后 ——
const FAMILIES = [
  ["GPT", /^(gpt|chatgpt|codex|o\d)/],
  ["Claude", /^claude/],
  ["Gemini", /^gemini/],
  ["Grok", /^grok/],
  ["DeepSeek", /^deepseek/],
  ["Qwen", /^(qwen|qwq)/],
  ["Kimi", /^(kimi|moonshot)/],
  ["GLM", /^(glm|chatglm)/],
  ["MiniMax", /^(minimax|abab)/],
  ["Doubao", /^(doubao|seed)/],
  ["Llama", /^llama/],
  ["Mistral", /^(mistral|mixtral|magistral|codestral|devstral|ministral)/],
];
/** 认不出的族：一个不随语言变的记号，显示时由界面翻译（model-picker.js 的 familyName，「其他」/ Other） */
export const OTHER_FAMILY = "other";
const ORDER = [...FAMILIES.map(([f]) => f), OTHER_FAMILY];

export function modelFamily(id) {
  const n = (playgroundSelection(id)?.model || shortModel(normModel(id)) || "").toLowerCase();
  return FAMILIES.find(([, re]) => re.test(n))?.[0] ?? OTHER_FAMILY;
}

/** 名字里第一个版本号（5-5、6.1、v4.1、qwen3.8）读成数字数组；4 位以上的数字是日期之类，到此为止 */
function version(id) {
  const m = id.match(/\d+(?:[.-]\d+)*/);
  const out = [];
  for (const p of m ? m[0].split(/[.-]/) : []) {
    if (p.length > 3) break;
    out.push(Number(p));
  }
  return out;
}

/** 族内排序：版本新的在前（6.1 > 6 > 5.6），同版本按名字 */
function newerFirst(a, b) {
  const x = version(a);
  const y = version(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? -1) - (x[i] ?? -1);
    if (d) return d;
  }
  return a.localeCompare(b);
}

/** 按模型族分组并按 q 筛选；返回 [族名, [[原始 id, 显示名]]]，族按固定顺序 */
export function groupModels(models, q = "") {
  const needle = q.trim().toLowerCase();
  const groups = new Map();
  for (const m of models) {
    const selected = playgroundSelection(m);
    const n = selected ? `${selected.group}/${selected.model}` : normModel(m);
    if (needle && !n.toLowerCase().includes(needle)) continue;
    const f = selected ? selected.group : modelFamily(m);
    if (!groups.has(f)) groups.set(f, []);
    // 官方 API 的模型写明是哪一家：同一个模型可能既有 OKINTO 的也有官方的，走的是两条路、两份账单
    const source = officialSource(m);
    const label = selected ? selected.model : n.includes("/") ? n.slice(n.indexOf("/") + 1) : n;
    groups.get(f).push([m, source ? `${label} · ${source}` : label]);
  }
  for (const ms of groups.values()) ms.sort((a, b) => newerFirst(a[1], b[1]));
  return [...groups.entries()].sort((a, b) => {
    const x = ORDER.indexOf(a[0]), y = ORDER.indexOf(b[0]);
    return x < 0 || y < 0 ? a[0].localeCompare(b[0]) : x - y;
  });
}
