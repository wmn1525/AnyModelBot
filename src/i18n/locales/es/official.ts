import type { TranslatedCatalog } from "../../index.js";
export default {
  invalid_key: "{name} no aceptó esta clave. Revísala y vuelve a intentarlo",
  rate_limited: "{name} está limitando las solicitudes en este momento. Vuelve a intentarlo dentro de un rato",
  network: "No se puede conectar con {name}. Si este dispositivo necesita un proxy para acceder, configura primero el proxy",
  upstream: "{name} no devolvió una lista de modelos: {detail}",
} satisfies TranslatedCatalog["official"];
