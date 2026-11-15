export default {
  "aria": "Conversa com {name}",
  "infoPanel": "Painel direito (⌘⇧I)",
  "newConvCmd": "Nova conversa (/new)",
  "toBottom": "Rolar até o fim",
  "copyMessage": "Copiar mensagem",
  "commandsLabel": "Comandos",
  "commands": {
    "stop": "Parar a mensagem em andamento",
    "tasks": "Listar as tarefas em segundo plano (/stop <número> interrompe uma delas)",
    "model": "Listar ou trocar modelos",
    "new": "Iniciar uma nova conversa (arquiva a anterior com uma nota de transição)",
    "reset": "Limpar o contexto desta conversa",
    "status": "Mostrar o modelo, o modo e o progresso atuais",
    "help": "Mostrar todos os comandos"
  },
  "perm": {
    "menu": "Acesso a arquivos",
    "title": "Acesso a arquivos: {note}",
    "workspace": "Gravação no espaço de trabalho",
    "workspaceNote": "Só pode editar o espaço de trabalho deste bot; pergunta a você antes de sair dele",
    "readonly": "Somente leitura",
    "readonlyNote": "Não pode editar arquivos; os comandos rodam em um sandbox somente leitura",
    "more": "Mais configurações de permissão…"
  },
  "approval": {
    "neededTask": "“{title}” precisa da sua aprovação · {code}",
    "needed": "Precisa da sua aprovação · {code}",
    "fallbackReason": "O bot quer fazer algo fora do espaço de trabalho dele",
    "allowOnce": "Permitir uma vez",
    "deny": "Negar"
  },
  "question": {
    "taskAsks": "“{title}” pergunta",
    "otherOptional": "Outra coisa (opcional)",
    "yourAnswer": "Digite sua resposta",
    "orOther": "Ou digite outra resposta",
    "submit": "Enviar"
  },
  "file": {
    "open": "Abrir {name}",
    "reveal": "Mostrar na pasta",
    "gone": "Arquivo não encontrado"
  },
  "work": {
    "stopping": "Parando…",
    "stoppingAfter": "Parando depois de {d}…",
    "process": "Atividade",
    "done": "Trabalhou por {d}",
    "replying": "Respondendo há {d}",
    "thinkingFor": "Pensando há {d}",
    "thinking": "Pensando"
  },
  "error": {
    "stopFailed": "Não foi possível parar: {error}",
    "fixKey": "Entrar",
    "fixOfficialKey": "Trocar chave",
    "officialKeyInvalid": "{name} recusou esta chave de API. Ela pode ser inválida ou ter sido revogada.",
    "authInvalid": "Seu acesso ao Okinto expirou ou foi revogado. Entre novamente.",
    "loadHistory": "Não foi possível carregar o histórico de mensagens: {error}"
  },
  "menu": {
    "more": "Mais ações",
    "switchModel": "Trocar modelo…",
    "newConv": "Nova conversa",
    "reset": "Limpar contexto",
    "status": "Mostrar status",
    "allCommands": "Todos os comandos",
    "usables": "Habilidades e apps"
  },
  "use": {
    "skills": "Habilidades",
    "apps": "Apps",
    "search": "Buscar habilidades ou apps",
    "noMatch": "Nenhum resultado",
    "prefill": "Use {name} para me ajudar a{cursor}…",
    "appExample": "Use {app} para me ajudar a…",
    "readonlyDesc": "Somente leitura: pode buscar e ler",
    "readonlyNo": "Este bot é somente leitura, então não pode escrever",
    "noSkills": "Este bot ainda não tem habilidades.",
    "noSkillsBody": "Importe uma habilidade ou envie a este bot uma instrução de instalação da biblioteca de habilidades.",
    "importSkill": "Importar uma habilidade",
    "noApps": "Este bot ainda não tem apps.",
    "noAppsBody": "Conecte um app e este bot já pode usá-lo.",
    "noAppsAssigned": "Seus apps conectados ainda não foram atribuídos a este bot.",
    "connectApp": "Conectar um app",
    "unassigned": "Não atribuídos a este bot",
    "assign": "Atribuir a este bot",
    "assigned": "{app} foi atribuído a {bot}. Já pode ser usado.",
    "usingSkill": "Usando a habilidade · {name}",
    "usingApp": "Usando {app}",
    "failedSkill": "Não foi possível usar a habilidade · {name}. {reason}",
    "failedApp": "Não foi possível usar {app}. {reason}",
    "reason": {
      "loading": "A habilidade ainda está carregando.",
      "connection": "Verifique a conexão com {app}.",
      "denied": "Você não permitiu esta chamada.",
      "readonly": "Este bot é somente leitura, então não pode escrever.",
      "failed": "Desta vez não deu certo."
    },
    "used": "Usado: {list}",
    "notUsed": "Não foi possível usar: {list}",
    "sep": ", ",
    "state": {
      "active": "Ativa",
      "waiting": "Ativa quando a tarefa atual terminar",
      "loading": "Carregando"
    },
    "try": "Experimente dizer: {example}",
    "fill": "Inserir na mensagem",
    "fillTitle": "Inserir na mensagem para este bot",
    "copy": "Copiar",
    "copyFailed": "Não foi possível copiar"
  },
  "reset": {
    "title": "Limpar o contexto desta conversa?",
    "body": "{name} vai esquecer o que foi dito nesta conversa na web. A memória de longo prazo é mantida.",
    "confirm": "Limpar"
  },
  "empty": {
    "guideTitle": "Oi, eu sou {name}",
    "guideBody": "Reserve 5 minutos e siga a lista para ver o que eu sei fazer.",
    "title": "Comece a conversar com {name}",
    "body": "Teste seu bot aqui mesmo. Conecte WeChat, Feishu, Telegram, Slack ou Discord no painel direito.",
    "sample": "Em que você pode me ajudar?",
    "helpChip": "/help para ver os comandos"
  },
  "composer": {
    "steer": "Complementar a resposta em andamento",
    "steerTitle": "Complementar a resposta em andamento ({key})",
    "stopping": "Parando…",
    "placeholder": "Mensagem para {name}, ou digite / para ver os comandos",
    "label": "Mensagem",
    "currentModel": "Modelo atual: {model}",
    "pickModel": "Escolher modelo",
    "stop": "Parar a geração (Esc)",
    "stopTitle": "Parar (Esc)",
    "send": "Enviar",
    "sendTitle": "Enviar ({key})"
  },
  "model": {
    "followBot": "Usar o padrão do bot",
    "setDefault": "Definir como modelo padrão deste bot"
  }
};
