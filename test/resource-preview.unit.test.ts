import { describe, expect, it } from "vitest";
// @ts-expect-error UI modules are native JavaScript.
import { addResource, removeResource, emptyResources, closeOtherResources, activeResource, fileResource, appFileResource, webImageResource, websiteResource, localFilePath, plainClick, resourcePreviewPath, resourceFileAction } from "../ui/lib/resource-preview.js";
// @ts-expect-error UI modules are native JavaScript.
import { parseMarkdown } from "../ui/lib/markdown.js";

describe("resource preview navigation", () => {
  it("keeps files in different conversations distinct and reuses an opened item", () => {
    const one = fileResource({ path: "out/report.md" }, "bot:one");
    const two = fileResource({ path: "out/report.md" }, "bot:two");
    let state = addResource(addResource(emptyResources(), one), two);
    expect(state.items).toHaveLength(2);
    state = addResource(state, one);
    expect(state.items).toHaveLength(2);
    expect(state.active).toBe(one.id);
    // 已经开着：位置不变，rev + 1 让它重新读取一次
    expect(state.items.map((x: any) => [x.id, x.rev])).toEqual([[one.id, 1], [two.id, 0]]);
    expect(removeResource(state, one.id)).toEqual({ items: [{ ...two, rev: 0 }], active: two.id });
    expect(removeResource(removeResource(state, one.id), two.id)).toEqual(emptyResources());
    expect(fileResource({ path: "missing.pdf", gone: true }, "bot:one")).toBeNull();
  });

  it("bounds the open list and preserves modified link clicks", () => {
    let state = emptyResources();
    for (let i = 0; i < 20; i++) state = addResource(state, fileResource({ path: `${i}.md` }, "c"));
    expect(state.items).toHaveLength(12);
    expect(state.items[0].path).toBe("8.md");
    expect(plainClick({ button: 0 })).toBe(true);
    for (const event of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) expect(plainClick(event)).toBe(false);
  });

  it("closes to the right first, closes others and keeps the tab being viewed when the 13th opens", () => {
    const tabs = ["a.md", "b.md", "c.md"].map((p) => fileResource({ path: p }, "c"));
    let state = tabs.reduce((s: any, t: any) => addResource(s, t), emptyResources());
    state = { ...state, active: tabs[1].id };
    expect(removeResource(state, tabs[1].id).active).toBe(tabs[2].id);
    expect(removeResource({ ...state, active: tabs[2].id }, tabs[2].id).active).toBe(tabs[1].id);
    expect(closeOtherResources(state, tabs[1].id)).toEqual({ items: [state.items[1]], active: tabs[1].id });
    expect(activeResource(emptyResources())).toBeNull();
    // 正在看最早打开的那个：再开第 13 个时关掉的是第二早的
    let full = emptyResources();
    for (let i = 0; i < 12; i++) full = addResource(full, fileResource({ path: `${i}.md` }, "c"));
    full = { ...full, active: full.items[0].id };
    full = addResource(full, fileResource({ path: "new.md" }, "c"));
    expect(full.items.map((x: any) => x.path)).toEqual(["0.md", ...Array.from({ length: 10 }, (_, i) => `${i + 2}.md`), "new.md"]);
    expect(full.active).toBe(fileResource({ path: "new.md" }, "c").id);
  });

  it("opens network and inline images as image tabs and routes save-as to the desktop API", () => {
    expect(webImageResource("https://picsum.photos/600/300")).toMatchObject({ type: "webimage", name: "picsum.photos" });
    expect(webImageResource("data:image/png;base64,AAAA", "封面")).toMatchObject({ type: "webimage", name: "封面" });
    for (const u of ["http://x.com/a.png", "data:text/html,hi", "javascript:alert(1)", "data:image/svg+xml;base64,AAAA"]) expect(webImageResource(u), u).toBeNull();
    const file = fileResource({ path: "out/a.csv" }, "bot:web:console", true);
    expect(resourcePreviewPath(file, "gbk")).toBe("/conversations/bot%3Aweb%3Aconsole/file/preview?path=out%2Fa.csv&encoding=gbk");
    expect(resourceFileAction(file, "save")).toEqual({ path: "/conversations/bot%3Aweb%3Aconsole/file/save", body: { path: "out/a.csv" } });
    expect(resourceFileAction(appFileResource("app/x.md", "bot"), "save").path).toBe("/bots/bot/app/save");
  });

  it("previews only external HTTP(S) URLs without credentials", () => {
    expect(websiteResource("https://example.com/a", "Docs", "http://localhost:5000")).toMatchObject({ type: "website", name: "Docs", url: "https://example.com/a" });
    for (const value of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "https://u:p@example.com", "/amb/api/status", "http://localhost:5000/amb/api/status"]) {
      expect(websiteResource(value, "", "http://localhost:5000"), value).toBeNull();
    }
  });

  it("keeps Bot workbench files on the app-scoped API", () => {
    const item = appFileResource("app/site/index.html", "bot", true);
    expect(resourcePreviewPath(item)).toBe("/bots/bot/app/preview?path=app%2Fsite%2Findex.html");
    for (const p of ["notes.md", "app/../secret.md", "app/%2e%2e/secret.md"]) expect(appFileResource(p, "bot")).toBeNull();
  });
});

describe("local document links", () => {
  it("enables file links only in a file-capable context, including nested Markdown", () => {
    const source = "# [Report](out/report.md)\n\n> **[Page](sandbox:/work/page.html)**\n\n| File |\n|---|\n| [PDF](file:///work/report.pdf) |";
    expect(JSON.stringify(parseMarkdown(source))).not.toContain('"t":"file"');
    const parsed = JSON.stringify(parseMarkdown(source, true));
    for (const p of ["out/report.md", "/work/page.html", "/work/report.pdf"]) expect(parsed).toContain(p);
    for (const p of ["../secret", "%2e%2e/secret", "javascript:alert(1)", "data:text/html,hi", "//server/file", "file://server/file", "file:///work/%00bad"]) expect(localFilePath(p), p).toBeNull();
    expect(localFilePath("C:\\work\\report.md")).toBe("C:\\work\\report.md");
  });
});
