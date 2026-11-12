import type { TranslatedCatalog } from "../../index.js";
export default {
  no_binary_cli: "No se encontró el ejecutable de magpie. Primero ejecuta npm run setup",
  no_binary: "No se encontró el ejecutable de magpie (ejecuta npm run setup para compilarlo desde vendor/magpie)",
  unsupported_url: "Dirección de OKINTO no compatible",
  missing_key: "Falta la clave de API",
  create_failed: "No se pudo crear la conexión con OKINTO: {detail}",
  not_running: "El gateway de modelos no se está ejecutando. Vuelve a intentarlo en un momento",
  disconnect_failed: "No se pudo desconectar: HTTP {status} {body}",
  save_failed: "No se pudo guardar: HTTP {status} {body}",
  verify_failed: "Falló la verificación después de guardar",
} satisfies TranslatedCatalog["magpie"];
