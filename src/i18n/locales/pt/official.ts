import type { TranslatedCatalog } from "../../index.js";
export default {
  invalid_key: "{name} não aceitou esta chave. Verifique e tente de novo",
  rate_limited: "{name} está limitando as solicitações agora. Tente de novo daqui a pouco",
  network: "Não foi possível acessar {name}. Se este dispositivo precisar de proxy para acessá-lo, configure o proxy primeiro",
  upstream: "{name} não retornou uma lista de modelos: {detail}",
} satisfies TranslatedCatalog["official"];
