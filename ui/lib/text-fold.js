// 搜索用的大小写折叠。土耳其语里 İ 的默认 toLowerCase() 会变成 i 加组合符，对不上键盘打出的 i；
// 无区域的 I 在土耳其语区域又会变成 ı。这里把 İ / I / ı / i 都折成 i，查询和候选用同一种折法。
const DOTLESS = new Set(["İ", "I", "ı", "i"]);

export function fold(value) {
  let out = "";
  for (const ch of String(value ?? "")) out += DOTLESS.has(ch) ? "i" : ch.toLowerCase();
  return out;
}
