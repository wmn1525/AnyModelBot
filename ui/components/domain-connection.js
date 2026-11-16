import { useRef, useState } from "preact/hooks";
import { html, MenuButton, Spinner } from "./ui.js";
import { api } from "../lib/api.js";
import { t } from "../lib/i18n.js";

const lineOptions = () => [
  ["global", t("onboarding.line.global")],
  ["cn", t("onboarding.line.cn")],
  ["cf", t("onboarding.line.cf")],
];

/** Domain choice is always manual. Legacy auto means modelflare.dev. */
export function DomainConnection({ value, onChange, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const test = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setResults(null);
    setError("");
    try {
      const data = await api("/modelflare/domains/test", { method: "POST", body: {} });
      setResults(data.results);
    } catch (e) {
      setError(e.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const resultText = (result) => {
    if (result.latencyMs !== null) return t("onboarding.line.result", {
      ms: result.latencyMs, count: result.samples.filter((s) => s.latencyMs !== null).length, total: result.samples.length,
    });
    const last = result.samples.at(-1);
    if (last?.status) return `HTTP ${last.status}`;
    return last?.error === "timeout" ? t("onboarding.line.timeout") : t("onboarding.line.unreachable");
  };
  return html`<div class="domain-connection">
    <div class="domain-actions">
      <${MenuButton} label=${t("onboarding.line.label")} options=${lineOptions()} value=${value === "auto" ? "global" : value} onChange=${onChange} disabled=${disabled} />
      <button type="button" class="btn sm" disabled=${disabled || busy} aria-busy=${busy || undefined} onClick=${test}>
        ${busy && html`<${Spinner} />`}${busy ? t("onboarding.line.testing") : t("onboarding.line.test")}
      </button>
    </div>
    <p class="hint">${t("onboarding.line.testNote")}</p>
    <div role="status" aria-live="polite" aria-busy=${busy}>
      ${results && html`<dl class="domain-results">${results.map((r) => html`<div key=${r.line}>
        <dt>${r.domain}</dt><dd>${resultText(r)}</dd>
      </div>`)}</dl>`}
      ${error && html`<p class="err-text">${error}</p>`}
    </div>
  </div>`;
}
