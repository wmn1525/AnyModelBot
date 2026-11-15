/** Display-copy checks only: identifiers, compatibility routes and license attribution are not brand labels. */
export const APP_LANGUAGES = ["zh-CN", "en", "ja", "ko", "ru", "es", "pt"];
export function legacyBrandValues(value, prefix = "", found = []) {
  if (typeof value === "string") {
    if (/modelflare/i.test(value)) found.push({ key: prefix, value });
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) legacyBrandValues(child, prefix ? `${prefix}.${key}` : key, found);
  }
  return found;
}
/** Locale files are trusted application source, consisting only of an exported literal object. */
export function localeObject(source, file) {
  const match = /export default\s+([\s\S]*?);?\s*$/.exec(source);
  if (!match) throw new Error(`Cannot inspect locale object: ${file}`);
  return Function(`"use strict"; return (${match[1].replace(/;\s*$/, "")});`)();
}
export function assertLocaleBranding(source, file) {
  const found = legacyBrandValues(localeObject(source, file));
  if (found.length) throw new Error(`${file}: legacy brand in display copy: ${found.map((x) => x.key).join(", ")}`);
}
