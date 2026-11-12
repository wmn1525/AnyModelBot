import type { Channel } from './channels';
export default [
  {
    id: 'slack', icon: 'hash', title: 'Slack', body: 'Mande mensagem para ele numa DM do Slack — no computador ou no celular, com imagens e arquivos também.', format: 'Canal (Socket Mode)',
    guide: { title: 'Conectar o Slack', steps: [
      'Em api.slack.com/apps, crie um app, ative o Socket Mode e gere um token de nível de app (xapp-…) com connections:write.',
      'Adicione os escopos de bot chat:write, im:history, files:read e files:write, assine o evento message.im e permita mensagens no App Home. Instale o app no seu workspace e copie o token do bot (xoxb-…).',
      'Abra Configurações → Canais de chat → Slack → Adicionar conta, cole os dois tokens e salve. Depois, envie uma mensagem direta para o bot no Slack.',
    ], limit: 'Por enquanto, só mensagens diretas. O app precisa estar em execução: mensagens enviadas enquanto ele está fechado não são recebidas.' },
  },
  {
    id: 'telegram', icon: 'send', title: 'Telegram', body: 'Crie um bot com o @BotFather e converse com ele de qualquer lugar — com imagens e arquivos também.', format: 'Canal (token do bot)',
    guide: { title: 'Conectar o Telegram', steps: [
      'No Telegram, abra uma conversa com o @BotFather, envie /newbot e siga as instruções. Copie o token do bot que ele fornecer.',
      'Abra Configurações → Canais de chat → Telegram → Adicionar conta, cole o token e salve.',
      'Abra o seu novo bot no Telegram e envie uma mensagem. A conexão usa long polling, então o seu computador não precisa de um endereço público.',
    ], limit: 'Por enquanto, só mensagens diretas. Mensagens enviadas com o app fechado são recebidas depois, se tiverem no máximo 24 horas.' },
  },
  {
    id: 'discord', icon: 'headset', title: 'Discord', body: 'Adicione o bot ao seu servidor e mande DMs para ele pelo computador ou pelo app do Discord.', format: 'Canal (token do bot)',
    guide: { title: 'Conectar o Discord', steps: [
      'No Discord Developer Portal, crie um aplicativo, adicione um bot e copie o token dele.',
      'Em OAuth2 → URL Generator, marque o escopo bot e abra o link para adicionar o bot a um servidor do qual você participa.',
      'Abra Configurações → Canais de chat → Discord → Adicionar conta, cole o token e salve. Depois, envie uma mensagem direta para o bot.',
    ], limit: 'Por enquanto, só mensagens diretas. O app precisa estar em execução: mensagens enviadas enquanto ele está fechado não são recebidas.' },
  },
] satisfies Channel[];
