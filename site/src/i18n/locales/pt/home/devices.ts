export default {
  "h2": "Você encontra o bot onde estiver.",
  "h2dim": "Mesmo bot, mesma memória.",
  "lead": "Desktop, Docker e navegador — além de Slack, Telegram ou Discord no celular.",
  "items": {
    "desktop": {
      "title": "Desktop",
      "sub": "Windows · macOS · Linux",
      "body": "Windows, macOS e Linux — é só baixar e usar.",
      "more": "Todos os downloads e somas de verificação →"
    },
    "docker": {
      "title": "Docker",
      "sub": "NAS / servidor",
      "body": "Rode em um NAS ou servidor, sempre ligado."
    },
    "browser": {
      "title": "Navegador",
      "body": "O app de desktop e o Docker incluem um console web local.",
      "format": "Local / auto-hospedado"
    }
  },
  "pick": "Escolha onde usar",
  "groupChat": "Apps de chat",
  "thread": {
    "user": "Quando eu costumo mandar o relatório diário?",
    "bot": "Todo dia às 17h — você me contou na semana passada.",
    "memo": "Relatório diário às 17h",
    "memoLabel": "Memória"
  },
  "chatBody": "Depois de conectar, você pode enviar tarefas pelo celular; o computador ou servidor que roda o bot precisa ficar ligado e conectado à internet.",
  "howTo": "Ver os passos",
  "guideTitle": "Guia de configuração",
  "note": "Ainda não há um app próprio para iOS/Android; no celular, converse com ele no Slack, Telegram ou Discord. O console web é local ou auto-hospedado — não é um app web na nuvem.",
  "browserGuide": {
    "title": "Console web local",
    "steps": [
      "Desktop: menu da bandeja → Abrir no navegador. O console escuta em 127.0.0.1 e gera um token de acesso aleatório a cada inicialização.",
      "Docker: abra http://<host>:3600/?token=<token>; leia o token com docker exec amb cat /data/ui-token.",
      "Não exponha a porta 3600 diretamente à internet."
    ]
  }
};
