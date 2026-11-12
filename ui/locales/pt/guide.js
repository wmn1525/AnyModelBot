export default {
  "defaultBotName": "Ping",
  "nameGeneric": "seu bot",
  "nameToast": "seu bot",
  "title": "Primeiros passos",
  "allDone": "Primeiros passos concluídos",
  "progress": "Primeiros passos · {progress}",
  "toastProgress": "Primeiros passos {progress} · {title}",
  "collapse": "Minimizar na barra lateral",
  "demoThis": "Prompt de demonstração",
  "watchDemo": "Ver demonstração",
  "tryThis": "Experimente isto",
  "sendThis": "Enviar",
  "followHint": "É só seguir as dicas",
  "takeMe": "Mostrar",
  "completed": "Concluído",
  "upNext": "A seguir",
  "hide": "Ocultar lista",
  "coachLabel": "Guia de primeiros passos",
  "closeCoach": "Fechar guia",
  "doneTitle": "Muito bem!",
  "fill": "Preencher",
  "openConsole": "Ativar modelos de imagem no console do OKINTO ↗",
  "later": "Talvez depois",
  "stopHere": "Por enquanto é só",
  "next": "Próximo: {title}",
  "demo": {
    "label": "Demonstração",
    "generating": "Gerando a imagem de exemplo",
    "alt": "Imagem de exemplo: um robozinho azul usando fones de ouvido, em estilo de ilustração plana",
    "zoomIn": "Ver em tamanho real",
    "zoomOut": "Reduzir",
    "caption": "Esta imagem de exemplo vem com o app; nenhum modelo foi chamado.",
    "enable": "Ativar modelos de imagem ↗"
  },
  "steps": {
    "hello": {
      "title": "Diga oi para {name}",
      "desc": "Converse com seu bot aqui mesmo. As respostas aparecem enquanto são escritas.",
      "how": [
        "Enter para enviar, Shift + Enter para nova linha",
        "Esc para interromper",
        "Digite / para ver todos os comandos"
      ],
      "try": "Em que você pode me ajudar?",
      "doneText": "Volte aqui quando quiser. A lista de passos no canto inferior esquerdo fica sempre com você."
    },
    "model": {
      "title": "Trocar de modelo",
      "desc": "Com uma única conta, você tem acesso a GPT, Claude, Gemini e outros, então cada tarefa pode ir para um modelo diferente.",
      "how": [
        "Clique no nome do modelo no canto inferior direito da caixa de mensagem e escolha um",
        "Vale só para esta conversa. Para continuar usando, clique em “Definir como modelo padrão deste bot” no fim da lista",
        "Cada modelo mostra o tamanho do contexto, os recursos e o preço estimado"
      ],
      "doneText": "Trocado, só nesta conversa. Faça uma pergunta."
    },
    "weixin": {
      "title": "Conecte {name} ao WeChat",
      "desc": "Escaneie um QR code e converse direto pelo WeChat. Não precisa instalar nenhum app novo, e ele fica on-line sempre que seu computador estiver ligado.",
      "how": [
        "Clique no nome do bot no topo para abrir o painel direito e depois em “Gerenciar canais de chat”",
        "Na linha do WeChat, clique em “Conectar”",
        "Escaneie o código com o WeChat e confirme no celular"
      ],
      "note": "Regra do WeChat: para cada mensagem que você envia, ele pode responder até 10 vezes em 24 horas. Para Feishu, Telegram, Slack ou Discord, adicione uma conta no mesmo lugar. Todos os bots compartilham as contas, e você pode enviar /bot e um nome em uma conversa para trocar de bot.",
      "doneText": "Mande uma mensagem para ele no WeChat. Para falar com outro bot, envie /bot."
    },
    "hands": {
      "title": "Coloque-o para trabalhar",
      "desc": "Ele pode criar arquivos e executar comandos no próprio espaço de trabalho e depois entregar os resultados para você.",
      "how": [
        "Ele só altera coisas no próprio espaço de trabalho",
        "Antes de mexer em arquivos fora dele, ele pergunta na conversa e espera você clicar em “Permitir uma vez”",
        "Prefere não arriscar? Mude a permissão no canto inferior esquerdo da caixa de mensagem para “Somente leitura”"
      ],
      "try": "Crie “today-todo.md” no seu espaço de trabalho com três coisas para fazer hoje e depois envie o arquivo para mim.",
      "doneText": "Os arquivos prontos aparecem na conversa. No WeChat e no Feishu, eles são enviados direto para você."
    },
    "memory": {
      "title": "Deixe que ele se lembre de você",
      "desc": "Conte suas preferências e as informações que você usa com frequência. Ele se lembra delas em novas conversas e no WeChat, mas nunca guarda senhas, chaves e coisas do tipo.",
      "how": [
        "É só dizer “Lembre-se…”. Ele também anota sozinho coisas importantes enquanto vocês conversam",
        "Para que ele esqueça, diga “Esqueça…” ou exclua em “Memória” no painel direito"
      ],
      "try": "Lembre-se: dê respostas curtas e comece pela conclusão.",
      "doneText": "Anotado. Você pode ver ou excluir em “Memória” no painel direito."
    },
    "media": {
      "title": "Gere uma imagem",
      "desc": "Ele pode criar imagens e vídeos. É só pedir que ele começa, e só confirma com você antes quando o custo é alto.",
      "how": [
        "Descreva a imagem que você quer",
        "As imagens prontas aparecem direto na conversa; clique em uma para ver em tamanho real",
        "Se for custar mais de $0.5, ele pergunta antes qual modelo usar"
      ],
      "try": "Desenhe um robozinho azul usando fones de ouvido, em estilo de ilustração plana.",
      "demoNote": "A demonstração funciona igual à de verdade, mas nenhum modelo é chamado e nada é cobrado.",
      "doneText": "Isso foi uma demonstração. Para gerar uma de verdade, é só pedir.",
      "noModelText": "Isso foi uma demonstração. Sua conta ainda não tem um modelo de imagem. Depois que você ativar um, o mesmo pedido gera uma imagem de verdade."
    }
  }
};
