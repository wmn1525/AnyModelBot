/** 包里的路径（目录 Bot 包、技能 ZIP、界面静态文件）只能是目录内的普通相对路径：不能是绝对路径、盘符、反斜杠、空段、. 或 ..。 */
export function safeRelPath(p: unknown): p is string {
  if (typeof p !== "string" || !p || p.length > 512) return false;
  if (p.includes("\\") || p.includes("\0") || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return false;
  return p.split("/").every((s) => s && s !== "." && s !== "..");
}
