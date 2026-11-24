// 电脑操作的 macOS 权限（第 18 项）：按工具实际要的那一项拦，不因为另一项没开就把能做的也拦下；其他平台一律放行。
import { describe, expect, it } from "vitest";
import { CuPermissions, permissionsFor, type CuPermissionState } from "../src/tools/computer-use/permissions.js";
import { Store } from "../src/store/db.js";

const hooks = (accessibility: CuPermissionState, screen: CuPermissionState) => ({
  status: () => ({ accessibility, screen }),
  request: async () => {},
  openSettings: () => {},
});

describe("电脑操作的系统权限", () => {
  it("输入要辅助功能，截图放大要屏幕录制，读窗口状态两样都要，不碰屏幕的不要", () => {
    expect(permissionsFor("click")).toEqual(["accessibility"]);
    expect(permissionsFor("type_text")).toEqual(["accessibility"]);
    expect(permissionsFor("zoom")).toEqual(["screen"]);
    expect(permissionsFor("get_window_state")).toEqual(["accessibility", "screen"]);
    expect(permissionsFor("list_apps")).toEqual([]);
  });

  // PRD 2026-11-20 R11：查询权限状态不能代替出示引导——缺项时问状态也出授权卡，只列实际缺的；系统禁止访问文件夹走另一页设置
  it("模型查询权限状态时缺项照样拦下并只记缺的那一项；打开「文件和文件夹」不算请求过屏幕录制", () => {
    expect(permissionsFor("check_permissions")).toEqual(["accessibility", "screen"]);
    const opened: string[] = [];
    const p = new CuPermissions(() => ({ ...hooks("denied", "granted"), openSettings: (k) => void opened.push(k), openFolderSettings: () => void opened.push("files") }));
    expect(p.gate("bot1", "check_permissions")).toEqual({ ok: false, missing: ["accessibility"] });
    expect(p.view().blocked.bot1?.missing).toEqual(["accessibility"]);
    p.openFolderSettings();
    expect(opened).toEqual(["files"]);
    expect(p.view().restartSuggested).toBe(false);
    // 其他系统（没有钩子）：这两项都不拦，也没有卡
    const other = new CuPermissions(() => undefined);
    expect(other.gate("bot1", "check_permissions")).toEqual({ ok: true });
    expect(other.view().supported).toBe(false);
  });

  it("只缺屏幕录制时：点击照常，截图被拦并记下这个机器人在等授权；授权后再调用会收起", () => {
    let screen: CuPermissionState = "denied";
    const p = new CuPermissions(() => ({ ...hooks("granted", "granted"), status: () => ({ accessibility: "granted", screen }) }));
    expect(p.gate("bot1", "click")).toEqual({ ok: true });
    expect(p.gate("bot1", "zoom")).toEqual({ ok: false, missing: ["screen"] });
    expect(p.view().blocked.bot1?.missing).toEqual(["screen"]);
    screen = "granted";
    expect(p.gate("bot1", "zoom")).toEqual({ ok: true });
    expect(p.view().blocked.bot1).toBeUndefined();
  });

  it("没挂上卡片的遗留等待状态不算在等，权限开启后清掉，重启后也不留", async () => {
    let granted = false;
    const store = new Store(":memory:"); store.createBot({ id: "b", name: "b" }); store.createBot({ id: "c", name: "c" });
    const h = () => ({ ...hooks("denied", "granted"), status: () => ({ accessibility: granted ? "granted" as const : "denied" as const, screen: "granted" as const }) });
    const p = new CuPermissions(h); p.bindStore(store);
    p.gate("b", "click");
    expect(Object.keys(p.view().blocked)).toEqual(["b"]);
    expect(p.waitingBots()).toEqual([]);
    // 重启：没有卡片的那条不恢复
    expect(Object.keys(new CuPermissions(h).view().blocked)).toEqual([]);
    const restored = new CuPermissions(h); restored.bindStore(store);
    expect(restored.view().blocked).toEqual({});
    // 卡片对应的消息被删掉了：也不恢复
    const conv = store.ensureConversation("c", "web", "console");
    const card = store.addMessage(conv.id, "assistant", "", undefined, { permissionWait: true });
    p.gate("c", "click"); p.attach("c", { conversationId: conv.id, messageId: card });
    expect(p.waitingBots()).toEqual(["c"]);
    expect(Object.keys(new CuPermissions(h).view().blocked)).toEqual([]);
    const withCard = new CuPermissions(h); withCard.bindStore(store);
    expect(Object.keys(withCard.view().blocked)).toEqual(["c"]);
    store.clearMessages(conv.id);
    const cleared = new CuPermissions(h); cleared.bindStore(store);
    expect(cleared.view().blocked).toEqual({});
    // 权限开启：遗留的那条直接清掉
    granted = true; await p.check();
    expect(p.view().blocked.b).toBeUndefined();
    expect(p.waitingBots()).toEqual([]);
    store.close();
  });

  it("插件记下的等待状态已被清掉时，挂卡片仍会按缺的权限重新建一条", () => {
    const store = new Store(":memory:"); store.createBot({ id: "b", name: "b" });
    const p = new CuPermissions(() => hooks("denied", "granted")); p.bindStore(store);
    const conv = store.ensureConversation("b", "web", "console");
    const card = store.addMessage(conv.id, "assistant", "", undefined, { permissionWait: true });
    p.attach("b", { conversationId: conv.id, messageId: card, missing: ["accessibility"] });
    expect(p.view().blocked.b).toMatchObject({ missing: ["accessibility"], messageId: card, state: "waiting" });
    expect(p.waitingBots()).toEqual(["b"]);
    // 没有 missing 也没有已记下的状态：什么都不建
    p.attach("x", { conversationId: conv.id, messageId: card });
    expect(p.view().blocked.x).toBeUndefined();
    store.close();
  });

  it("没有 macOS 钩子（其他平台、命令行、Docker）时一律放行", () => {
    const p = new CuPermissions(() => undefined);
    expect(p.supported).toBe(false);
    expect(p.gate("bot1", "click")).toEqual({ ok: true });
  });
});
