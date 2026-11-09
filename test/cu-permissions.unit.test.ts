// 电脑操作的 macOS 权限（第 18 项）：按工具实际要的那一项拦，不因为另一项没开就把能做的也拦下；其他平台一律放行。
import { describe, expect, it } from "vitest";
import { CuPermissions, permissionsFor, type CuPermissionState } from "../src/tools/computer-use/permissions.js";

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

  it("没有 macOS 钩子（其他平台、命令行、Docker）时一律放行", () => {
    const p = new CuPermissions(() => undefined);
    expect(p.supported).toBe(false);
    expect(p.gate("bot1", "click")).toEqual({ ok: true });
  });
});
