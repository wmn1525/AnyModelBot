import { BrowserWindow, session, type Session } from "electron";
import crypto from "node:crypto";
import type { NewApiDesktop } from "../src/providers/newapi.js";

/** Dedicated browser profile per app data directory and New API origin. No credentials cross renderer IPC. */
export function newApiDesktop(origin: string, dataDir: string): NewApiDesktop {
  const partition = `persist:okinto-${crypto.createHash("sha256").update(`${origin}\n${dataDir}`).digest("hex").slice(0, 24)}`;
  const browserSession = session.fromPartition(partition);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.on("will-download", (event) => event.preventDefault());
  let active: ReturnType<NewApiDesktop["login"]> | undefined;
  return {
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url).origin !== origin) return Promise.reject(new Error("New API session requests must use the configured origin"));
      return browserSession.fetch(url, { ...init, credentials: "include" });
    }) as typeof fetch,
    clear: async () => { await browserSession.clearStorageData(); },
    login() {
      if (active) return active;
      let cancel!: () => void;
      const result = new Promise<void>((resolve, reject) => {
        const children = new Set<BrowserWindow>();
        const window = new BrowserWindow({ width: 1060, height: 800, title: "登录 OKINTO", autoHideMenuBar: true,
          webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
        let finished = false;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          browserSession.cookies.off("changed", onCookie);
          for (const child of children) if (!child.isDestroyed()) child.destroy();
          if (!window.isDestroyed()) window.destroy();
          active = undefined;
          if (error) reject(error); else resolve();
        };
        // OAuth login stays in this isolated session; HTTPS providers keep their normal login UI.
        const secureNavigation = (contents: Electron.WebContents) => {
          contents.on("will-navigate", (event, url) => { if (!/^https:\/\//i.test(url) && !(origin.startsWith("http://127.0.0.1:") && url.startsWith(origin + "/"))) event.preventDefault(); });
          contents.setWindowOpenHandler(({ url }) => /^https:\/\//i.test(url) ? { action: "allow", overrideBrowserWindowOptions: { webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } } } : { action: "deny" });
          contents.on("did-create-window", (child) => { children.add(child); secureNavigation(child.webContents); });
        };
        secureNavigation(window.webContents);
        const timeout = setTimeout(() => finish(new Error("登录超时，请重试")), 10 * 60_000);
        const onCookie: Parameters<Session["cookies"]["on"]>[1] = (_event: unknown, cookie: Electron.Cookie, _cause: unknown, removed: boolean) => {
          const host = new URL(origin).hostname;
          if (!removed && cookie.name === "new_api_refresh" && cookie.value && cookie.domain?.replace(/^\./, "") === host) {
            // Close the site's frontend before rotating, avoiding two clients racing the refresh cookie.
            finish();
          }
        };
        browserSession.cookies.on("changed", onCookie);
        window.on("closed", () => { if (!finished) finish(new Error("cancelled")); });
        cancel = () => finish(new Error("cancelled"));
        // The refresh cookie is path-scoped to /api/user/auth, so probe the actual
        // refresh endpoint instead of looking for it at the site root.
        void browserSession.fetch(`${origin}/api/user/auth/refresh`, {
          method: "POST", credentials: "include", redirect: "error",
          headers: { Accept: "application/json", "content-type": "application/json", Origin: origin, Referer: `${origin}/` }, body: "{}",
        }).then(async (response) => {
          if (finished) return;
          const body = await response.json().catch(() => ({})) as { success?: boolean };
          if (response.ok && body.success) finish();
          else void window.loadURL(`${origin}/login`).catch(() => finish(new Error("无法打开 OKINTO 登录页面，请检查网络后重试")));
        }).catch(() => { if (!finished) finish(new Error("无法检查 OKINTO 登录状态，请重试")); });
      });
      active = { result, cancel: () => cancel() };
      return active;
    },
  };
}
