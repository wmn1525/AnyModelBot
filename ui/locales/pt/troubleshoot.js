export default {
  "status": "Status",
  "checks": "Testes",
  "version": "Versão",
  "dataDir": "Pasta de dados",
  "copyPath": "Copiar caminho",
  "logFile": "Arquivo de log",
  "logFileSub": "Rotacionado por tamanho; mantém os 4 arquivos mais recentes",
  "logFileOff": "Não ativado",
  "test": "Testar",
  "model": "Modelo: {model}",
  "none": "(nenhum)",
  "copyReport": "Copiar diagnóstico",
  "copied": "Diagnóstico copiado (chaves removidas)",
  "note": "O diagnóstico copiado inclui o status acima, os resultados dos testes mais recentes e os logs. Chaves de API, tokens e outros segredos são substituídos por ***, então você pode enviá-lo direto para o suporte.",
  "secs": "{s} s",
  "restarts": {
    "one": "Reiniciado {count} vez",
    "many": "Reiniciado {count} vezes",
    "other": "Reiniciado {count} vezes"
  },
  "lastExit": "Última saída: code={code}{signal}",
  "verdict": {
    "ok": "Tudo certo",
    "bad": "Problemas encontrados"
  },
  "gateway": {
    "name": "Gateway de modelos",
    "fromEnv": "Definido por {env}",
    "running": "Em execução",
    "starting": "Iniciando",
    "restarting": "Reiniciando",
    "failed": "Falhou",
    "stopped": "Parado",
    "external": "Endpoint externo"
  },
  "agent": {
    "name": "Processo do agente",
    "nameFor": "Processo do agente · {bot}",
    "noRuntime": "Runtime do agente (DSH) não encontrado; os bots só conversam",
    "disabled": "O modo agente está desativado; os bots só conversam",
    "startsOnFirst": "Inicia quando chega a primeira mensagem",
    "stderr": {
      "one": "Saída do processo do agente (última {count} linha do stderr)",
      "many": "Saída do processo do agente (últimas {count} linhas do stderr)",
      "other": "Saída do processo do agente (últimas {count} linhas do stderr)"
    }
  },
  "host": {
    "running": "Em execução",
    "starting": "Iniciando",
    "backoff": "Aguardando nova tentativa",
    "error": "Pausado",
    "stopped": "Não iniciado"
  },
  "hostSub": {
    "elapsed": "Decorrido: {time}",
    "stage": "Etapa: {stage}",
    "firstStart": "A primeira inicialização pode levar alguns minutos (o antivírus verifica cada arquivo do runtime)",
    "maxWait": {
      "one": "Espera até {count} minuto",
      "many": "Espera até {count} minutos",
      "other": "Espera até {count} minutos"
    },
    "initTime": "Tempo de inicialização: {time}",
    "activeTurns": {
      "one": "{count} turno em andamento",
      "many": "{count} turnos em andamento",
      "other": "{count} turnos em andamento"
    },
    "retryIn": {
      "one": "Nova tentativa automática em {count} minuto, ou clique em “Reiniciar processo do agente” abaixo",
      "many": "Nova tentativa automática em {count} minutos, ou clique em “Reiniciar processo do agente” abaixo",
      "other": "Nova tentativa automática em {count} minutos, ou clique em “Reiniciar processo do agente” abaixo"
    }
  },
  "init": {
    "prepare": "Preparando",
    "bridgeReady": "Ponte de modelos pronta",
    "sdkLoaded": "Carregando o runtime",
    "patchWritten": "Gravando a configuração",
    "childSpawned": "Processo iniciado",
    "initializing": "Inicializando (carregando plugins)"
  },
  "stage": {
    "ok": "Aprovado",
    "warn": "Aviso",
    "fail": "Falhou",
    "timeout": "Tempo esgotado",
    "skipped": "Ignorado",
    "pending": "Em andamento"
  },
  "pwsh": {
    "checking": "Verificando",
    "checkingBusy": "Verificando…",
    "missing": "Não instalado",
    "looking": "Procurando o PowerShell 7",
    "usedBy": "O agente executa comandos com ele",
    "old": "Versão antiga: instale o PowerShell 7 para ter comandos muito mais rápidos e confiáveis",
    "builtin": "O agente está executando comandos com o Windows PowerShell 5.1 integrado, que pode levar de 20 a 30 segundos por comando. Instale o PowerShell 7 para ter comandos muito mais rápidos e confiáveis",
    "recheck": "Verificar de novo",
    "install": "Instalar o PowerShell 7",
    "copyCmd": "Copiar comando de instalação",
    "download": "Baixar ↗",
    "fallback": "{from} não iniciou ({reason}), por isso foi substituído automaticamente",
    "unusable": "Inutilizável",
    "notInstalled": "Não instalado",
    "usedByFrom": "O agente executa comandos com ele ({source})",
    "installingSub": "Instalando o PowerShell 7 para o agente (não precisa de direitos de administrador); até lá, os comandos continuam usando o Windows PowerShell 5.1",
    "badSub": "O PowerShell 7 gerenciado pelo app não pode ser usado: {reason}",
    "failedSub": "Não instalado: {error}",
    "unknownReason": "motivo desconhecido",
    "using51": "Por enquanto, o agente usa o Windows PowerShell 5.1",
    "slow51": "O agente está usando o Windows PowerShell 5.1, que pode levar de 20 a 30 segundos por comando",
    "slow51Advice": "O agente está usando o Windows PowerShell 5.1, que pode levar de 20 a 30 segundos por comando; o PowerShell 7 é muito mais rápido",
    "reinstall": "Reinstalar",
    "installShort": "Instalar",
    "reinstallPrivate": "Reinstalar o PowerShell 7 gerenciado pelo app",
    "useSystem": "Voltar ao padrão do sistema",
    "useSystemNote": "Parar de usar o PowerShell 7 gerenciado pelo app",
    "usePrivate": "Usar o PowerShell 7 gerenciado pelo app",
    "installSelf": "Instalar o PowerShell 7 por conta própria…",
    "more": "Mais",
    "moreLabel": "Mais ações do PowerShell",
    "source": {
      "private": "Gerenciado pelo app",
      "programFiles": "Program Files",
      "preview": "Preview"
    }
  },
  "testModel": {
    "name": "Testar modelo",
    "sub": "Envia uma requisição mínima pelo gateway integrado e outra direto ao endpoint, depois compara os códigos de status, a latência e o nome do modelo retornado",
    "viaGateway": "Pelo gateway integrado",
    "direct": "Direto ao endpoint"
  },
  "probe": {
    "untested": "Não testado",
    "ok": "OK",
    "echoed": "Modelo retornado: {model}",
    "reply": "Resposta: “{reply}”"
  },
  "testAgent": {
    "name": "Testar agente",
    "sub": "Executa um turno mínimo pelo processo do agente (não fica salvo no histórico de conversas) para descobrir onde ele trava: início → plugins → modelo → resposta",
    "ok": "O agente está funcionando",
    "stuckAt": "Travou em: {stage}",
    "bot": "Bot: {name}",
    "total": "Total: {time}"
  },
  "restart": {
    "name": "Reiniciar processo do agente",
    "sub": "Use quando as respostas ficarem carregando sem parar: encerra o processo do agente e zera a espera para nova tentativa. Ele reinicia com a próxima mensagem",
    "button": "Reiniciar",
    "done": "Processo do agente reiniciado",
    "notRunning": "O processo do agente ainda não iniciou; ele vai iniciar com a próxima mensagem"
  },
  "logs": {
    "title": "Logs recentes",
    "lines": {
      "one": "{count} linha",
      "many": "{count} linhas",
      "other": "{count} linhas"
    },
    "empty": "(nenhum log ainda)",
    "readFailed": "Não foi possível ler os logs: {error}"
  }
};
