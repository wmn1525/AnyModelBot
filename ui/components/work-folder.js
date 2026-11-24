// 输入框上方左侧的工作文件夹选择位（PRD R1）：「文件夹图标 + 名称 / 选择文件夹 + 下拉箭头」，一个简单的下拉：
// 最近文件夹（有记录才显示，当前项打勾，同名的附父路径）、「选择文件夹…」、「不使用文件夹」，底下一句说明。
// 选择只记位置：不读里面的文件、不发消息、不启动任务；之后发出的指令才按需在原位置读写。
// 网页端（不是运行机器人的桌面版）、代理模式关着时选择位置灰，悬停说明原因；已有的选择照常显示。
import { useEffect, useRef, useState } from "preact/hooks";
import { html, Icon, Menu } from "./ui.js";
import { clearFolder, pickFolder, refreshFolder, sameNames, selectFolder, useFolder } from "../lib/folder.js";
import { t } from "../lib/i18n.js";

export function WorkFolder({ botId }) {
  const f = useFolder(botId);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    void refreshFolder(botId);
  }, [botId]);
  // 目录 Bot：文件范围由它声明的权限决定，不显示选择位
  if (!f.loaded || f.reason === "catalog") return null;
  const cur = f.current;
  const why = !f.picker ? (f.reason === "agentOff" ? t("folder.agentOff") : t("folder.desktopOnly")) : "";
  const gone = cur && cur.available === false;
  const title = gone ? t("folder.gone") : cur ? cur.path : why || t("folder.choose");
  const dup = sameNames(f.recent);
  const items = [
    ...(f.recent.length ? [{ group: t("folder.recent") }] : []),
    ...f.recent.map((r) => ({
      label: r.name,
      note: dup(r) ? r.parent : undefined,
      title: r.path,
      icon: "folder",
      cur: cur?.id === r.id,
      onSelect: () => cur?.id !== r.id && void selectFolder(botId, r.id),
    })),
    ...(f.recent.length ? [{ sep: true }] : []),
    { label: t("folder.pick"), icon: "plus", onSelect: () => void pickFolder(botId) },
    ...(cur ? [{ label: t("folder.none"), icon: "close", onSelect: () => void clearFolder(botId) }] : []),
    { custom: html`<p class="folder-hint">${t("folder.hint")}</p>` },
  ];
  return html`<div class="folder-row">
    <button type="button" class=${`folder-chip${cur ? " on" : ""}${gone ? " gone" : ""}`} ref=${ref} data-folder-chip
      disabled=${!f.picker || f.busy} aria-haspopup="menu" aria-expanded=${open} title=${title}
      aria-label=${cur ? t("folder.current", { name: cur.name }) : t("folder.choose")} onClick=${() => setOpen((v) => !v)}>
      <${Icon} name=${gone ? "warning" : "folder"} size="sm" class="lead" />
      <span class="v">${cur ? cur.name : t("folder.choose")}</span>
      ${f.picker && html`<${Icon} name="chevDown" size="xs" />`}
    </button>
    ${open && html`<${Menu} anchor=${ref.current} prefer="up" align="left" width=${280} label=${t("folder.menu")} onClose=${() => setOpen(false)} items=${items} />`}
  </div>`;
}
