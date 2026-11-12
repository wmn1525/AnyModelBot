import type { TranslatedCatalog } from "../../index.js";
export default {
  failed: "Não foi possível concluir a conexão. Verifique sua rede e tente de novo.",
  feishuStartRefused: "O Feishu se recusou a iniciar a autorização. Tente de novo ou use um app que você já tem.",
  feishuDeclined: "Você recusou a autorização no Feishu.",
  feishuQrExpired: "O QR code expirou. Tente de novo.",
  feishuAppRefused: "O Feishu recusou este app. Verifique o App ID e o Secret, e se o app tem as permissões de mensagens.",
  feishuNoRefreshToken: "O Feishu não forneceu um login de longa duração. Tente de novo.",
  feishuAuthExpired: "A autorização expirou. Tente de novo.",
  feishuAuthIncomplete: "O Feishu não concluiu a autorização. Tente de novo.",
  notionUnavailable: "Não foi possível acessar o serviço de login do Notion. Tente de novo daqui a pouco.",
  notionUnexpected: "O serviço de login do Notion deu uma resposta inesperada.",
  notionRegistrationUnavailable: "O serviço de login do Notion não aceita novos clientes.",
  notionRegistrationRefused: "O serviço de login do Notion se recusou a registrar este app.",
  notionLinkExpired: "Este link de login expirou. Comece de novo em Configurações.",
  notionDeclined: "Você recusou a autorização.",
  notionAuthIncomplete: "O Notion não concluiu a autorização.",
  notionExchangeFailed: "O Notion não concluiu a autorização. Tente de novo.",
} satisfies TranslatedCatalog["connections"];
