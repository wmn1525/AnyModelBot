import { useCallback, useEffect, useLayoutEffect, useState } from "preact/hooks";

// Window-local drafts and positions. Search never sends text to a model or persists
// an extra copy of chat contents in browser storage.
const views = new Map();
export const chatView = (id) => views.get(id) || { text: "", top: 0, atBottom: true };
export function saveChatView(id, patch) { views.set(id, { ...chatView(id), ...patch }); }
/** 没发出的草稿（只在系统要求重新打开应用时交给后端暂存一次，重新打开后放回去、随即删掉） */
export const allDrafts = () => Object.fromEntries([...views].filter(([, v]) => v.text && v.text.trim()).map(([k, v]) => [k, v.text]));
export function restoreDrafts(map) {
  let any = false;
  for (const [k, v] of Object.entries(map || {})) if (typeof v === "string" && v && !chatView(k).text) (saveChatView(k, { text: v }), (any = true));
  // 已经打开的对话页在初始化时读过草稿：通知它们重新取一次（只填空着的输入框，不覆盖已经打的字）
  if (any) window.dispatchEvent(new Event("amb-drafts-restored"));
}
export function useChatDraft(id) {
  const [text, set] = useState(() => chatView(id).text);
  useEffect(() => {
    const on = () => set((old) => old || chatView(id).text);
    window.addEventListener("amb-drafts-restored", on);
    return () => window.removeEventListener("amb-drafts-restored", on);
  }, [id]);
  const update = useCallback((value) => set((old) => {
    const next = typeof value === "function" ? value(old) : value;
    saveChatView(id, { text: next });
    return next;
  }), [id]);
  return [text, update];
}

/**
 * 对话流跟着底部（对话页、群聊页共用）：内容自己长高（草稿卡读到内容、关于我的提示行、图片读完）或输入框变高时，
 * 本来就停在底部的再贴一次底，新出现的那一行露在输入框上方；没在底部（往上翻着看）时不动。
 * 输入框（连同上方工作文件夹那一行）的实际高度写进 --composer-live（多行、带附件时比一行高），对话列的下边距、「回到底部」和滚动定位按它留位置。
 * scroller：.chat-scroll 的 ref；stick：「在底部」的 ref（onScroll 里更新）
 */
export function useFollowBottom(scroller, stick) {
  useLayoutEffect(() => {
    const el = scroller.current;
    const section = el?.parentElement;
    if (!el || !section || typeof ResizeObserver === "undefined") return;
    const col = el.firstElementChild;
    // 量整个底座的内容高度（输入框，加上它上方的工作文件夹那一行），不含底座自己的上下留白
    const dock = section.querySelector(".composer-dock");
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === dock) {
          const cs = getComputedStyle(dock);
          const h = dock.getBoundingClientRect().height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
          section.style.setProperty("--composer-live", `${Math.ceil(h)}px`);
        }
      }
      if (stick.current && el.getClientRects().length) el.scrollTop = el.scrollHeight;
    });
    if (col) ro.observe(col);
    if (dock) ro.observe(dock);
    return () => ro.disconnect();
  }, []);
}
