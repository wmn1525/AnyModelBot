import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error UI modules are native JavaScript.
import * as pt from "../ui/lib/preview-types.js";
// @ts-expect-error UI modules are native JavaScript.
import { parseMarkdown, parseInline } from "../ui/lib/markdown.js";
import { cutToLine, decodeText, pdfPages, withLinkScript } from "../src/web/file-previews.js";
import { watchFiles } from "../src/web/preview-watch.js";

describe("preview file types and names", () => {
  it("chooses the viewer and language from the name", () => {
    const cases: Array<[string, string, string]> = [
      ["trip.md", "markdown", "markdown"], ["plan.py", "code", "python"], ["main.go", "code", "go"], ["App.java", "code", "java"], ["lib.rs", "code", "rust"],
      ["View.swift", "code", "swift"], ["a.tsx", "code", "typescript"], ["Dockerfile", "code", "dockerfile"], ["Makefile", "code", "makefile"],
      ["notes.txt", "text", "plaintext"], ["run.log", "text", "plaintext"], ["LICENSE", "text", "plaintext"], [".gitignore", "text", "plaintext"],
      ["data.json", "json", "json"], ["rows.jsonl", "jsonl", "json"], ["budget.csv", "csv", "plaintext"], ["t.tsv", "tsv", "plaintext"], ["index.html", "html", "xml"],
      ["cover.PNG", "image", "plaintext"], ["icon.svg", "image", "xml"], ["行程单.pdf", "pdf", "plaintext"], ["报价.xlsx", "other", "plaintext"],
    ];
    for (const [name, type, lang] of cases) {
      expect(pt.previewType(name), name).toBe(type);
      expect(pt.langOf(name), name).toBe(lang);
    }
    expect(["markdown", "code", "csv", "html", "image", "pdf", "other", "website"].map(pt.typeIcon)).toEqual(["file", "code", "table", "globe", "photo", "pdf", "doc", "globe"]);
    // 信息行的语言名按文件本身：借别的语言着色的扩展名不显示那门语言的名字
    expect(["plan.py", "config.toml", "App.vue", "a.tsx", "Dockerfile", "notes.txt"].map(pt.langLabel)).toEqual(["Python", "TOML", "Vue", "TSX", "Dockerfile", ""]);
    expect(pt.wrapDefault("a.log")).toBe(true);
    expect(pt.wrapDefault("a.py")).toBe(false);
  });

  it("keeps the extension when a long name is shortened in the middle", () => {
    const { head, tail } = pt.splitName("2026-11-15-weekend-trip-plan-final-v3.md");
    expect(head + tail).toBe("2026-11-15-weekend-trip-plan-final-v3.md");
    expect(tail.endsWith(".md")).toBe(true);
    expect(pt.splitName("a.md")).toEqual({ head: "a.md", tail: "" });
  });

  it("formats delivery times as today / yesterday / date", () => {
    const now = new Date(2026, 10, 15, 13, 0).getTime();
    expect(pt.deliveredWhen(new Date(2026, 10, 15, 12, 40).getTime(), now)).toEqual(["time", "12:40"]);
    expect(pt.deliveredWhen(new Date(2026, 10, 14, 9, 0).getTime(), now)[0]).toBe("yesterday");
    expect(pt.deliveredWhen(new Date(2026, 10, 13, 9, 0).getTime(), now)[0]).toBe("date");
  });
});

describe("CSV", () => {
  it("detects comma, semicolon and tab and parses quoted fields with delimiters and newlines", () => {
    expect(pt.detectDelimiter("a,b,c\n1,2,3\n")).toBe(",");
    expect(pt.detectDelimiter("a;b;c\n1;2;3\n")).toBe(";");
    expect(pt.detectDelimiter("a\tb\n1\t2\n")).toBe("\t");
    const r = pt.parseCsv('项目,说明\n"湖边, 古镇","第一行\n第二行"\n门票,"他说 ""好"""\n', ",");
    expect(r.rows).toEqual([["项目", "说明"], ["湖边, 古镇", "第一行\n第二行"], ["门票", '他说 "好"']]);
    // 原文件的行号：第二条记录占了两行
    expect(r.lines).toEqual([1, 2, 4]);
    expect(pt.parseCsv('a,"b\n', ",").error).toBe("quote");
    expect(pt.parseCsv("﻿a,b\r\n1,2\r\n", ",").rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("recognises numeric columns, sorts and exports what is shown", () => {
    expect([pt.numValue("1,234.5"), pt.numValue("-3"), pt.numValue("12%"), pt.numValue("abc"), pt.numValue("")].map((n) => (Number.isNaN(n) ? "NaN" : n))).toEqual([1234.5, -3, 12, "NaN", "NaN"]);
    expect(pt.numericColumns([["a", "1"], ["b", "2,000"], ["c", ""], ["d", "3.5"]], 2)).toEqual([false, true]);
    expect(pt.toCsv([["a", "b,c"], ["x", 'q"t']])).toBe('a,"b,c"\nx,"q""t"');
  });
});

describe("JSON", () => {
  it("formats into foldable lines and reports where invalid JSON breaks", () => {
    const model = pt.jsonLines({ title: "周末", days: 2, spots: ["a", "b", "c"], empty: [] });
    expect(model.lines.map((l: any) => l.n)).toEqual(model.lines.map((_: any, i: number) => i + 1));
    expect(model.nodes.map((n: any) => [n.depth, n.count, n.arr])).toEqual([[0, 4, false], [1, 3, true]]);
    expect(pt.defaultCollapsed(model).size).toBe(0);
    const big = pt.jsonLines({ a: { b: { c: Array.from({ length: 6000 }, (_, i) => i) } } });
    expect([...pt.defaultCollapsed(big)]).toEqual(big.nodes.filter((n: any) => n.depth >= 2).map((n: any) => n.id));
    let err: unknown;
    try { JSON.parse('{\n  "a": 1,\n  "b": \n}'); } catch (e) { err = e; }
    expect(pt.jsonErrorLine('{\n  "a": 1,\n  "b": \n}', err)).toBeGreaterThanOrEqual(3);
  });
});

describe("highlighting and outline", () => {
  it("splits highlighted HTML into self-contained lines", () => {
    const lines = pt.splitHighlighted('<span class="a">x\ny<span class="b">z\nw</span></span>\nend');
    expect(lines).toEqual(['<span class="a">x</span>', '<span class="a">y<span class="b">z</span></span>', '<span class="a"><span class="b">w</span></span>', "end"]);
    expect(pt.escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });

  it("finds heading lines outside code fences", () => {
    expect(pt.headingLines("# 周末\n\n```\n# not\n```\n## [行程](a.md)\n##### 五级")).toEqual([
      { level: 1, text: "周末", line: 1 }, { level: 2, text: "行程", line: 6 }, { level: 5, text: "五级", line: 7 },
    ]);
  });

  it("ships the vendored highlighter with the languages the viewer maps to", () => {
    const dir = path.join(import.meta.dirname, "../ui/vendor/hljs");
    expect(fs.existsSync(path.join(dir, "core.js"))).toBe(true);
    for (const lang of Object.keys(pt.LANGS)) expect(fs.existsSync(path.join(dir, "languages", `${lang}.js`)), lang).toBe(true);
    expect(fs.readFileSync(path.join(dir, "LICENSE"), "utf8")).toContain("BSD 3-Clause");
  });
});

describe("Markdown images and tasks", () => {
  it("parses image syntax with titles, linked images and task items", () => {
    expect(parseInline('![山](https://x.com/a.png "清晨")')).toEqual([{ t: "img", alt: "山", src: "https://x.com/a.png", title: "清晨" }]);
    expect(parseInline("[![i](i.png)](https://l.com)")).toEqual([{ t: "a", href: "https://l.com", c: [{ t: "img", alt: "i", src: "i.png", title: "" }] }]);
    // 输出到一半（地址还没写完）不当成图片
    expect(JSON.stringify(parseInline("![a](https://exa"))).not.toContain('"img"');
    const list = parseMarkdown("- [ ] 订房\n- [x] 买票\n- 普通")[0];
    expect(list.items.map((i: any) => i.task)).toEqual([false, true, undefined]);
  });
});

describe("Markdown image sources", () => {
  let md: any;
  beforeAll(async () => {
    vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), dispatchEvent() { return true; } });
    vi.stubGlobal("document", { documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } }, addEventListener() {} });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    // @ts-expect-error UI modules are native JavaScript.
    md = await import("../ui/components/markdown.js");
  });
  afterAll(() => vi.unstubAllGlobals());

  it("loads https and inline images, resolves local ones and leaves the rest as links", () => {
    expect(md.imageSource("https://picsum.photos/600/300")).toMatchObject({ kind: "web", label: "picsum.photos/300" });
    expect(md.imageSource("data:image/png;base64,AAAA")).toMatchObject({ kind: "data" });
    expect(md.imageSource("images/a.png", { conv: "b:web:console", filePath: "out/trip.md" }).url).toBe("/amb/api/conversations/b%3Aweb%3Aconsole/file?path=out%2Fimages%2Fa.png");
    expect(md.imageSource("images/a.png", { conv: "b:web:console" }).url).toBe("/amb/api/conversations/b%3Aweb%3Aconsole/file?path=images%2Fa.png");
    expect(md.imageSource("http://x.com/a.png")).toEqual({ kind: "link", href: "http://x.com/a.png" });
    expect(md.imageSource("javascript:alert(1)")).toEqual({ kind: "link", href: null });
    expect(md.imageSource("../secret.png", { conv: "c" })).toEqual({ kind: "link", href: null });
    expect(md.imageSource("report.pdf", { conv: "c" })).toMatchObject({ kind: "link", resource: { type: "file", path: "report.pdf" } });
  });
});

describe("preview reading helpers", () => {
  it("decodes UTF-8, BOM and GBK and cuts at whole lines", () => {
    expect(decodeText(Buffer.from("你好\n"))).toMatchObject({ text: "你好\n", encoding: "utf-8" });
    expect(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toMatchObject({ text: "a", encoding: "utf-8-bom" });
    expect(decodeText(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]))).toMatchObject({ text: "你好", encoding: "gbk" });
    expect(decodeText(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]), "utf-8").encoding).toBe("utf-8");
    expect(cutToLine(Buffer.from("a\nb\nc")).toString()).toBe("a\nb\n");
    expect(pdfPages(Buffer.from("<< /Type /Page >> << /Type /Page >> << /Type /Pages /Count 2 >>"))).toBe(2);
    expect(pdfPages(Buffer.from("not a pdf"))).toBeUndefined();
  });

  it("puts the link script after <head> so the page stays in standards mode", () => {
    const page = withLinkScript(Buffer.from("<!doctype html><html><head><title>x</title></head></html>")).toString();
    expect(page.startsWith("<!doctype html><html><head><script>")).toBe(true);
    expect(withLinkScript(Buffer.from("<!DOCTYPE html><p>x")).toString().startsWith("<!DOCTYPE html><script>")).toBe(true);
  });

  it("merges rapid writes and waits a quiet second before reporting a deletion", () => {
    vi.useFakeTimers();
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "amb-watch-"));
    const file = path.join(dir, "a.md");
    fs.writeFileSync(file, "1");
    let now = 0;
    const seen: any[] = [];
    const off = watchFiles([{ key: "k", file }], (e) => seen.push(e), { every: 100, quiet: 1000, now: () => now });
    const step = (ms: number) => { for (let t = 0; t < ms; t += 100) { now += 100; vi.advanceTimersByTime(100); } };
    for (let i = 0; i < 10; i++) { fs.writeFileSync(file, "x".repeat(i + 2)); step(200); }
    expect(seen).toEqual([]);
    step(1200);
    expect(seen).toEqual([{ key: "k", size: 11, mtimeMs: expect.any(Number) }]);
    fs.rmSync(file);
    step(500);
    fs.writeFileSync(file, "back");
    step(1200);
    expect(seen.filter((e) => e.gone)).toEqual([]);
    fs.rmSync(file);
    step(1200);
    expect(seen.at(-1)).toEqual({ key: "k", gone: true });
    off();
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
