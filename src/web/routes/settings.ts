/** 应用设置（设置页的常规、模型、搜索等）。 */
import { REASONING_EFFORTS, ZOOMS, saveConfigFile } from "../../config.js";
import { SEARCH_PROVIDERS, normalizeSearxUrl, type SearchProvider } from "../../tools/search.js";
import { normalizeLang, setLangPref, t, type LangPref } from "../../i18n/index.js";
import { HttpError, readJson, send, type Route, type WebContext } from "../http.js";

export function settingsRoutes(ctx: WebContext): Route {
  const { app, host, token } = ctx;
  const cfg = app.config;
  return async (req, res, url, seg, p, m) => {
    if (p === "/settings") {
      if (m === "PUT") {
        const b = await readJson(req);
        if (b.defaultModel !== undefined) app.setDefaultModel(String(b.defaultModel));
        if (b.reasoningEffort !== undefined) {
          const effort = REASONING_EFFORTS.find((x) => x === b.reasoningEffort);
          if (!effort) throw new HttpError(400, t("web.badReasoningEffort"));
          app.setReasoningEffort(effort);
        }
        if (b.imageModel !== undefined || b.videoModel !== undefined) {
          app.setMediaModels({
            ...(b.imageModel !== undefined ? { imageModel: String(b.imageModel) } : {}),
            ...(b.videoModel !== undefined ? { videoModel: String(b.videoModel) } : {}),
          });
        }
        if (b.closeToTray !== undefined) {
          cfg.ui.closeToTray = !!b.closeToTray;
          saveConfigFile(cfg.dataDir, (f) => (f.ui = { ...(f.ui ?? {}), closeToTray: cfg.ui.closeToTray }));
        }
        if (b.autoDownloadUpdates !== undefined) {
          if (typeof b.autoDownloadUpdates !== "boolean") throw new HttpError(400, "autoDownloadUpdates must be boolean");
          cfg.ui.autoDownloadUpdates = b.autoDownloadUpdates;
          saveConfigFile(cfg.dataDir, (f) => (f.ui = { ...(f.ui ?? {}), autoDownloadUpdates: cfg.ui.autoDownloadUpdates }));
          app.desktop?.updates?.setAutoDownload(cfg.ui.autoDownloadUpdates);
        }
        if (b.zoom !== undefined) {
          const z = Number(b.zoom);
          if (!ZOOMS.includes(z)) throw new HttpError(400, t("web.badZoom"));
          cfg.ui.zoom = z;
          saveConfigFile(cfg.dataDir, (f) => (f.ui = { ...(f.ui ?? {}), zoom: z }));
          app.desktop?.applyZoom(z);
        }
        if (b.lang !== undefined) {
          const l = b.lang === "system" ? "system" : normalizeLang(b.lang);
          if (!l) throw new HttpError(400, t("web.badLang"));
          cfg.ui.lang = l as LangPref;
          saveConfigFile(cfg.dataDir, (f) => (f.ui = { ...(f.ui ?? {}), lang: l }));
          setLangPref(cfg.ui.lang);
        }
        if (b.autostart !== undefined) {
          if (!app.desktop?.autostart().supported) throw new HttpError(400, t("web.noAutostart"));
          app.desktop.setAutostart(!!b.autostart);
        }
        if (b.webSearch && typeof b.webSearch === "object") {
          const w = b.webSearch as Record<string, unknown>;
          if (w.provider !== undefined && !SEARCH_PROVIDERS.includes(w.provider as SearchProvider)) throw new HttpError(400, t("web.badSearchProvider"));
          const url = w.url === undefined ? undefined : normalizeSearxUrl(String(w.url));
          if (url === undefined && w.url !== undefined) throw new HttpError(400, t("web.badSearchUrl"));
          app.setWebSearch({
            ...(w.provider !== undefined ? { provider: w.provider as SearchProvider } : {}),
            ...(w.key !== undefined ? { key: String(w.key).trim() } : {}),
            ...(url !== undefined ? { url } : {}),
          });
        }
      } else if (m !== "GET") throw new HttpError(405, "method not allowed");
      return send(res, 200, {
        defaultModel: cfg.llm.defaultModel,
        reasoningEffort: cfg.llm.reasoningEffort,
        imageModel: cfg.media.imageModel,
        videoModel: cfg.media.videoModel,
        closeToTray: cfg.ui.closeToTray,
        autoDownloadUpdates: cfg.ui.autoDownloadUpdates,
        autoUpdateSupported: !!app.desktop?.updates,
        zoom: cfg.ui.zoom,
        lang: cfg.ui.lang,
        autostart: app.desktop ? app.desktop.autostart() : { supported: false, on: false },
        desktop: !!app.desktop,
        listen: { host, port: ctx.boundPort, tokenRequired: !!token },
        dataDir: cfg.dataDir,
        webSearch: app.webSearchView(),
      });
    }
    return false;
  };
}
