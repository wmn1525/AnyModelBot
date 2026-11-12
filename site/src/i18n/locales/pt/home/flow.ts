export default {
  "h2": "Seus dados.",
  "h2dim": "Para onde eles vão de verdade?",
  "lead": "O que fica na sua máquina e o que precisa sair — está tudo no diagrama.",
  "local": "Seu dispositivo",
  "localBadge": "Local",
  "out": "Sai do seu dispositivo",
  "vendors": "Provedores de modelos",
  "channels": "Canais que você conecta",
  "onlyRequest": "Só esta solicitação",
  "nodes": {
    "chats": {
      "label": "Histórico de conversas (SQLite)",
      "body": "Armazenado em um banco de dados SQLite no seu diretório de dados; excluir um bot exclui as conversas dele."
    },
    "memory": {
      "label": "Memória de longo prazo (Markdown)",
      "body": "Arquivos Markdown no seu diretório de dados, com um registro de alterações em journal.jsonl; senhas, chaves e números de documentos não são salvos."
    },
    "workspace": {
      "label": "Arquivos do espaço de trabalho",
      "body": "O espaço de trabalho do próprio bot; por padrão, as gravações ficam aqui; sair dele exige o seu OK."
    },
    "key": {
      "label": "Chave do modelo (isolada, últimos 4 visíveis)",
      "body": "Fica no processo do gateway e na configuração; o processo do agente nunca vê a chave real; a interface mostra só os últimos 4 caracteres."
    },
    "console": {
      "label": "Console: 127.0.0.1 + token",
      "body": "Por padrão, escuta em 127.0.0.1 e verifica o cabeçalho Host; o modo Docker exige um token de acesso."
    },
    "gateway": {
      "label": "Gateway do OKINTO",
      "sub": "Encaminha as solicitações ao modelo selecionado",
      "body": "As solicitações passam pela okinto. Os logs, o cache e a retenção seguem sua política de privacidade e as configurações da conta."
    },
    "vendors": {
      "label": "OpenAI / Anthropic / Google …",
      "body": "Recebem o que você envia ao modelo, incluindo o conteúdo da tela durante o uso do computador."
    },
    "channels": {
      "label": "Apps de chat",
      "sub": "Slack · Telegram · Discord",
      "body": "As mensagens nesses apps passam, por natureza, pelos servidores deles."
    }
  },
  "retentionLink": "Política de privacidade da okinto",
  "retentionUrl": "https://api.okinto.com/privacy-policy",
  "compare": {
    "caption": "okbot comparado com assistentes típicos hospedados na nuvem",
    "head": [
      "",
      "okbot",
      "Assistentes típicos na nuvem"
    ],
    "rows": [
      [
        "Onde roda",
        "No seu computador / no seu servidor",
        "Na nuvem do fornecedor"
      ],
      [
        "Onde ficam as conversas e a memória",
        "No seu disco",
        "Nos servidores do fornecedor"
      ],
      [
        "Modelos",
        "Qualquer modelo do OKINTO, troque quando quiser",
        "Geralmente presos aos modelos do próprio fornecedor"
      ],
      [
        "Cobrança",
        "App grátis; modelos cobrados por uso pelo OKINTO",
        "Geralmente uma assinatura mensal com planos"
      ],
      [
        "Uso do computador",
        "Opera o seu próprio computador (24 ações delimitadas)",
        "Opera um computador na nuvem oferecido pelo fornecedor"
      ],
      [
        "As solicitações de inferência saem do seu dispositivo?",
        "Sim, via OKINTO até o provedor do modelo",
        "Sim"
      ],
      [
        "Código auditável",
        "MIT",
        "Em geral, não"
      ]
    ],
    "note": "“Assistentes típicos na nuvem” descreve a abordagem comum de produtos hospedados pelo fornecedor e cobrados por assinatura, não um produto específico."
  },
  "security": "Leia as notas de segurança completas →"
};
