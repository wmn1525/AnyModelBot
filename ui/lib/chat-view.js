import { useCallback, useState } from "preact/hooks";

// Window-local drafts and positions. Search never sends text to a model or persists
// an extra copy of chat contents in browser storage.
const views = new Map();
export const chatView = (id) => views.get(id) || { text: "", top: 0, atBottom: true };
export function saveChatView(id, patch) { views.set(id, { ...chatView(id), ...patch }); }
export function useChatDraft(id) {
  const [text, set] = useState(() => chatView(id).text);
  const update = useCallback((value) => set((old) => {
    const next = typeof value === "function" ? value(old) : value;
    saveChatView(id, { text: next });
    return next;
  }), [id]);
  return [text, update];
}
