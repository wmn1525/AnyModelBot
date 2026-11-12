import type { TranslatedCatalog } from "../../index.js";
export default {
  no_binary_cli: "Executável do magpie não encontrado. Execute npm run setup primeiro",
  no_binary: "Executável do magpie não encontrado (execute npm run setup para compilá-lo a partir de vendor/magpie)",
  unsupported_url: "Endereço do OKINTO não suportado",
  missing_key: "Falta a chave de API",
  create_failed: "Não foi possível criar a conexão com o OKINTO: {detail}",
  not_running: "O gateway de modelos não está em execução. Tente de novo daqui a pouco",
  disconnect_failed: "Falha ao desconectar: HTTP {status} {body}",
  save_failed: "Falha ao salvar: HTTP {status} {body}",
  verify_failed: "A verificação falhou depois de salvar",
} satisfies TranslatedCatalog["magpie"];
