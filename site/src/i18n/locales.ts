import manifest from "./manifest.json";
/** Shared by static routes, metadata and the browser language selector. */
export const LANGS = ["zh", "en", "ja", "ko", "ru", "es", "pt"] as const;
export type Lang = (typeof LANGS)[number];
export const READY_LANGS = manifest.locales.filter((l) => l.ready).map((l) => l.siteCode as Lang);
export const LOCALES = {
  zh: { name: "简体中文", tag: "zh-CN", og: "zh_CN", hint: "此页面也提供简体中文版本", action: "切换为简体中文" },
  en: { name: "English", tag: "en", og: "en_US", hint: "This page is also available in English", action: "Switch to English" },
  ja: { name: "日本語", tag: "ja", og: "ja_JP", hint: "このページは日本語でもご覧いただけます", action: "日本語に切り替える" },
  ko: { name: "한국어", tag: "ko", og: "ko_KR", hint: "이 페이지는 한국어로도 볼 수 있습니다", action: "한국어로 전환" },
  ru: { name: "Русский", tag: "ru", og: "ru_RU", hint: "Эта страница доступна на русском языке", action: "Перейти на русский" },
  es: { name: "Español", tag: "es", og: "es_LA", hint: "Esta página también está disponible en español", action: "Cambiar a español" },
  pt: { name: "Português (Brasil)", tag: "pt-BR", og: "pt_BR", hint: "Esta página também está disponível em português", action: "Mudar para português" },
} as const;

export function normalizeLang(value: string): Lang | undefined {
  const base = value.trim().toLowerCase().split(/[-_.@]/)[0];
  return LANGS.find((lang) => lang === base);
}

/** Chinese URLs remain at the root; other languages have a stable prefix. */
export const href = (lang: Lang, path: string) => lang === "zh" ? path : `/${lang}${path}`;
export const switchHref = (to: Lang, path: string) => href(to, path === "/404" ? "/" : path);
