export default {
  "aria": "Painel direito",
  "botSettings": "Configurações do bot",
  "closeTitle": "Fechar (⌘⇧I)",
  "closeAria": "Fechar painel direito",
  "channels": "Canais",
  "channelsDefault": "Este bot responde por padrão",
  "channelsManage": "Gerenciar canais de chat",
  "channelsSub": "Todos os bots compartilham estas contas. Adicione-as em Configurações > Canais de chat",
  "approvals": "Aprovações pendentes",
  "due": "Expira às {time}",
  "noApprovals": "Nenhuma aprovação pendente",
  "recent": "Conversas recentes",
  "noConvs": "Nenhuma conversa ainda",
  "noMessages": "Nenhuma mensagem",
  "emptyMessage": "(vazia)",
  "channel": {
    "web": "Web",
    "feishu": "Feishu",
    "weixin": "WeChat",
    "telegram": "Telegram",
    "slack": "Slack",
    "discord": "Discord"
  },
  "feishu": {
    "bindHint": "Envie uma mensagem ao bot pela sua própria conta do Feishu para concluir a vinculação.",
    "sub": "Recebe mensagens por uma conexão persistente",
    "secretSaved": "{masked} salvo. Deixe em branco para manter",
    "saveConnect": "Salvar e conectar",
    "disconnect": "Desconectar",
    "disconnectTitle": "Desconectar o Feishu?",
    "disconnectBody": "Isso remove o App ID e o App Secret do Feishu deste bot."
  },
  "messenger": {
    "bindHint": "Envie uma mensagem ao bot pela sua própria conta para concluir a vinculação.",
    "secretSaved": "{masked} salvo. Deixe em branco para manter",
    "saveConnect": "Salvar e conectar",
    "disconnect": "Desconectar",
    "disconnectTitle": "Desconectar {channel}?",
    "disconnectBody": "Isso remove as credenciais de {channel} deste bot. Depois de reconectar, a primeira pessoa que mandar mensagem para ele se torna o proprietário.",
    "telegram": {
      "sub": "Recebe mensagens por long polling",
      "token": "Token do bot"
    },
    "slack": {
      "sub": "Recebe mensagens pelo Socket Mode",
      "botToken": "Token do bot",
      "appToken": "Token de nível de app"
    },
    "discord": {
      "sub": "Recebe mensagens pelo Gateway",
      "token": "Token do bot"
    }
  },
  "weixin": {
    "sub": "Canal oficial iLink",
    "linked": "Vinculado: {id}",
    "qrAlt": "QR code de login do WeChat",
    "scanHint": "Escaneie com o WeChat e confirme no celular.",
    "verifyCode": "Código de verificação",
    "submit": "Enviar",
    "pausedUntil": "Pausado até {time}",
    "login": "Escanear para entrar",
    "relogin": "Escanear para entrar de novo",
    "enable": "Ativar o canal do WeChat",
    "disable": "Desativar o canal do WeChat",
    "unlink": "Desvincular",
    "unlinkTitle": "Desvincular o WeChat?",
    "unlinkBody": "Você vai precisar escanear o QR code de novo para enviar e receber mensagens do WeChat.",
    "quota": "Cota de envio (até 10 mensagens em até 24 horas após cada mensagem recebida): {list}",
    "quotaItem": "{user}…: restam {count}",
    "quotaSep": "; "
  },
  "memory": {
    "title": "Memória",
    "refresh": "Atualizar memória",
    "empty": "Nenhuma memória de longo prazo ainda",
    "delete": "Excluir esta memória",
    "deleteTitle": "Excluir esta memória?",
    "deleted": "Excluída"
  },
  "access": {
    "head": "Pedidos de uso",
    "allowed": "Permitido: “{who}”",
    "denied": "Negado: “{who}”",
    "messages": {
      "one": "enviou {count} mensagem",
      "many": "enviou {count} mensagens",
      "other": "enviou {count} mensagens"
    },
    "wants": "Quer usar este bot · código de pareamento {code}",
    "quote": "“{text}”",
    "allow": "Permitir",
    "deny": "Negar",
    "replyHint": "Você também pode responder “yes {code}” na conversa."
  },
  "turn": {
    "stopFailed": "Não foi possível parar: {error}",
    "processing": "Processando há {d}",
    "waitingAgent": "Aguardando o processo do agente",
    "idle": "Sem progresso há {d}",
    "stop": "Parar",
    "activity": "Atividade"
  },
  "tasks": "Tarefas",
  "tabsLabel": "Abas do painel",
  "tab": {
    "resources": "Prévia",
    "app": "Espaço de trabalho",
    "overview": "Visão geral",
    "tasks": "Tarefas",
    "memory": "Memória"
  },
  "noTasks": "Nenhuma tarefa ou regra ainda",
  "preview": {
    "openPanel": "Prévia no painel lateral",
    "empty": "Clique em um arquivo ou link no chat para abri-lo aqui.",
    "address": "Endereço do site",
    "invalidUrl": "Digite um endereço válido (http ou https).",
    "download": "Baixar",
    "downloadFull": "Baixar arquivo completo",
    "openSystem": "Abrir com o app padrão",
    "openBrowser": "Abrir no navegador",
    "openBrowserExt": "Abrir no navegador ↗",
    "openNewTab": "Abrir em nova aba ↗",
    "revealMac": "Mostrar no Finder",
    "revealWin": "Mostrar no Explorador de Arquivos",
    "saveAs": "Salvar como…",
    "websiteHint": "Alguns sites não podem ser exibidos aqui ou exigem login. Se não carregar, escolha “Abrir no navegador ↗” no menu ⋯.",
    "slow": "Ainda carregando… está demorando um pouco",
    "reload": "Recarregar",
    "failed": "Não foi possível abrir este arquivo",
    "failedDesc": "Talvez ele esteja sendo usado por outro app.",
    "gone": "{name} não foi encontrado",
    "goneDesc": "Ele pode ter sido excluído ou movido.",
    "unsupported": "Ainda não é possível visualizar este tipo de arquivo aqui",
    "unsupportedDesc": "Tente abri-lo com outro app do seu computador.",
    "emptyFile": "Este arquivo está vazio",
    "emptyFileDesc": "Ele vai aparecer aqui quando o bot escrever nele.",
    "truncated": "Mostrando os primeiros 2 MB de {size}.",
    "tooLarge": "Este arquivo é grande demais para visualizar aqui",
    "tooLargeDesc": "{name} tem {size}. A visualização de páginas web vai até 32 MB.",
    "htmlSafe": "Modo seguro: os scripts podem rodar, mas esta página não pode buscar dados da internet, enviar formulários nem acessar suas contas",
    "webPage": "Página web",
    "lines": {
      "one": "{n} linha",
      "many": "{n} linhas",
      "other": "{n} linhas"
    },
    "pages": {
      "one": "{n} página",
      "many": "{n} páginas",
      "other": "{n} páginas"
    },
    "firstPart": "Primeiros 2 MB",
    "noColor": "Arquivo grande, sem destaque de sintaxe",
    "justUpdated": "Atualizado agora",
    "newChanges": "Há alterações · Atualizar",
    "updateFailed": "Falha ao atualizar · Tentar de novo",
    "updated": "Atualizado para a versão mais recente",
    "more": "Mais ações",
    "viewLabel": "Visualização",
    "view": {
      "markdown": {
        "preview": "Visualizar",
        "source": "Código-fonte"
      },
      "html": {
        "preview": "Visualizar",
        "source": "Código"
      },
      "csv": {
        "table": "Tabela",
        "source": "Texto bruto"
      },
      "json": {
        "formatted": "Formatado",
        "source": "Texto bruto"
      }
    },
    "wrap": "Quebrar linhas",
    "encoding": "Codificação de texto",
    "encodingAuto": "Detectar automaticamente ({encoding})",
    "copyMarkdown": "Copiar Markdown",
    "copyAll": "Copiar tudo",
    "copyJson": "Copiar JSON",
    "copyCsv": "Copiar como CSV",
    "copySource": "Copiar código-fonte",
    "copyImage": "Copiar imagem",
    "copyUrl": "Copiar URL",
    "copyImageUrl": "Copiar endereço da imagem",
    "copyPath": "Copiar caminho do arquivo",
    "shownPart": " (parte exibida)",
    "copied": "Copiado",
    "pathCopied": "Caminho copiado",
    "copyFailed": "Não foi possível copiar. Tente de novo.",
    "savedTo": "Salvo em “{folder}”",
    "saveFailed": "Não foi possível salvar. Tente outro local.",
    "downloading": "Baixando {name}",
    "scriptRevealedMac": "Por segurança, scripts não são executados diretamente. Mostrado no Finder.",
    "scriptRevealedWin": "Por segurança, scripts não são executados diretamente. Mostrado no Explorador de Arquivos.",
    "scriptRevealed": "Por segurança, scripts não são executados diretamente. Mostrado na pasta.",
    "zoom": "Zoom",
    "zoomIn": "Ampliar",
    "zoomOut": "Reduzir",
    "zoomReset": "Voltar para 100%",
    "close": "Fechar",
    "closeTab": "Fechar aba",
    "closeNamed": "Fechar {name}",
    "closeOthers": "Fechar outras abas",
    "closeAll": "Fechar todas",
    "tabsLabel": "Arquivos abertos",
    "expand": "Expandir",
    "exitExpand": "Sair da visualização expandida",
    "expandHint": "Pressione Esc ou clique de novo para sair",
    "outline": "Sumário",
    "yesterday": "Ontem",
    "files": {
      "title": "Arquivos deste chat",
      "open": "Abrir outros arquivos deste chat",
      "gone": "Não está mais disponível",
      "empty": "Ainda não há arquivos neste chat",
      "viewAll": {
        "one": "Ver {n}",
        "many": "Ver todos os {n}",
        "other": "Ver todos os {n}"
      }
    },
    "image": {
      "fit": "Ajustar",
      "zoomIn": "Ampliar",
      "zoomOut": "Reduzir",
      "pan": "Arraste para mover quando ampliada"
    },
    "json": {
      "expandAll": "Expandir tudo",
      "collapseAll": "Recolher tudo",
      "items": {
        "one": "{n} item",
        "many": "{n} itens",
        "other": "{n} itens"
      },
      "invalid": "Não é um JSON válido. Há um erro perto da linha {line}.",
      "expand": "Expandir",
      "collapse": "Recolher"
    },
    "csv": {
      "search": "Pesquisar",
      "header": "A primeira linha é o cabeçalho",
      "column": "Coluna {n}",
      "rows": {
        "one": "{n} linha",
        "many": "{n} linhas",
        "other": "{n} linhas"
      },
      "columns": {
        "one": "{n} coluna",
        "many": "{n} colunas",
        "other": "{n} colunas"
      },
      "matches": "{hits} / {total} linhas",
      "noResults": "Nenhum resultado para “{query}”",
      "headerOnly": "Só há cabeçalho, sem linhas de dados",
      "parseFailed": "Não foi possível ler como tabela. Mostrando o texto bruto.",
      "overRows": "Mostrando as primeiras 50.000 de {total} linhas. Abra com o app padrão para ver tudo.",
      "overRowsWeb": "Mostrando as primeiras 50.000 de {total} linhas. Baixe o arquivo completo para ver tudo.",
      "over10mb": "Este arquivo tem mais de 10 MB. Mostrando as primeiras {n} linhas. Abra com o app padrão para ver tudo.",
      "over10mbWeb": "Este arquivo tem mais de 10 MB. Mostrando as primeiras {n} linhas. Baixe o arquivo completo para ver tudo."
    }
  },
  "expandWorkspace": "Expandir espaço",
  "restoreWorkspace": "Voltar ao chat"
};
