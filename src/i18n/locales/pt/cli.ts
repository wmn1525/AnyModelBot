import type { TranslatedCatalog } from "../../index.js";
export default {
  tryCn: "Confira a chave e o grupo no console da OKINTO e tente novamente.",
  connected: "OKINTO New API conectado; {count} modelos dispon?veis",

  entered: "(digitado)",
  done: "Pronto. Execute npm start para iniciar. Para o WeChat, escaneie o QR code na interface de gerenciamento, em Configurações > Canais de chat, ou execute npm run weixin:login.",
  title: "Configuração inicial do okbot (pasta de dados: {dir})",
  noMagpie: "executável do magpie não encontrado; execute npm run setup primeiro",
  alreadyConnected:
    "O OKINTO já está conectado (chave terminada em {tail}{account}); a conexão atual será mantida.",
  accountSuffix: ", conta {name}",
  signedIn: "conectada",
  askHow: "Conectar modelos: Enter = entrar no OKINTO (no navegador deste computador), remote = entrar em outro dispositivo, key = usar sua própria chave de API oficial, skip = conectar depois na interface de gerenciamento: ",
  askOfficial: "Qual provedor (digite um número): ",
  askOfficialKey: "Chave de API do {name} (obtenha uma em {url}): ",
  officialConnected: "{name} conectado, {count} modelos disponíveis",
  alreadyOfficial: "Uma chave de API oficial já está definida; esta etapa foi pulada",
  regionCn: "China",
  regionGlobal: "Global",
  askLoginLink: "Abra o link acima em um navegador e entre. Quando a página parar em um endereço que não carrega, cole aqui o link completo da barra de endereços: ",
  askLine:
    "Domínio da API: Enter = modelflare.dev, origin = origin.modelflare.dev, cf = cf.modelflare.dev: ",
  askFeishuId: "App ID do Feishu (cli_xxx, deixe vazio para pular): ",
  askFeishuSecret: "App Secret do Feishu: ",
  savedToBot: "✓ Salvo no bot “{name}”",
  openLink:
    "Abra o link abaixo no navegador deste computador, entre no OKINTO (ou crie uma conta) e clique em Continue para autorizar:",
  signedInConnected:
    "✓ Login concluído ({name}); a chave deste computador está conectada e {count} modelos foram encontrados",
  loginIncomplete: "O login não foi concluído",
  setupFailed: "A configuração falhou:",
  weixinConnected:
    "✓ WeChat conectado. Execute npm start para enviar e receber mensagens (se já estiver em execução, reinicie ou reative o canal WeChat na interface de gerenciamento).",
} satisfies TranslatedCatalog["cli"];
