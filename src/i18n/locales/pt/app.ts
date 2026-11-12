import type { TranslatedCatalog } from "../../index.js";
export default {
  external_mode: "As conexões com o OKINTO não são gerenciadas ao usar um endpoint de modelo externo",
  bot_not_found: "Bot não encontrado",
  magpie_failed: "O magpie não conseguiu iniciar: {message}",
  default_bot_name: "Meu assistente",
  default_bot_prompt: "Você é um assistente prestativo. Responda de forma concisa e precisa.",
  feishu_failed: "Conta do Feishu “{name}”: a conexão persistente não conseguiu iniciar: {message}",
  messenger_failed: "A conta do {channel} “{name}” não consegue se conectar. Verifique as credenciais em Configurações > Canais de chat: {message}",
  feishu_history_denied:
    "A conta do Feishu “{name}” não consegue ler o histórico de mensagens do Feishu, então as mensagens enviadas enquanto ela estava offline não podem ser recuperadas. Conceda ao app o escopo im:message.history:readonly na Feishu Open Platform.",
  weixin_expired: "Conta do WeChat “{name}”: o login expirou. Escaneie o QR code de novo em Configurações > Canais de chat",
  weixin_connected: "Conta do WeChat “{name}” conectada",
  weixin_account_name: "WeChat",
  feishu_account_name: "Feishu",
  media_image: "Imagem",
  media_file: "Arquivo",
  media_video: "Vídeo",
  media_quoted_image: "Imagem citada",
  media_quoted_file: "Arquivo citado",
  media_quoted_video: "Vídeo citado",
  media_voice: "[Mensagem de voz]",
  media_not_downloaded: "{label} (não foi possível baixar: {error})",
  weixinExpiredSubject: "O login do WeChat expirou",
  data_dir_locked:
    "Outro processo do okbot ({who}) está usando a pasta de dados {dir}. Encerre esse processo ou use outra pasta de dados (AMB_DATA_DIR).",
  data_dir_locked_remote: "pid {pid} em {host}",
} satisfies TranslatedCatalog["app"];
