import type { TranslatedCatalog } from "../../index.js";
export default {
  balance_failed: "No se pudo consultar el saldo ({status})",
  bad_balance: "La respuesta del saldo no es v?lida",

  unreachable: "No se puede conectar con {host} ({reason}). Revisa tu red. Si usas un proxy o una VPN, activa su proxy del sistema o el modo TUN y vuelve a intentarlo",
  timeout: "se agotó el tiempo de espera",
  invalid_key: "La clave no es válida o se revocó",
  forbidden: "Esta clave no tiene permiso para usar este modelo o grupo",
  unavailable: "OKINTO no está disponible temporalmente (HTTP {status}){retry}",
  retry_after: "; vuelve a intentarlo en {s} s",
  bad_models: "OKINTO devolvió una lista de modelos que no se pudo leer",
} satisfies TranslatedCatalog["modelflare"];
