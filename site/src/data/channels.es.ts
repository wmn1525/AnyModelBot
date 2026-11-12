import type { Channel } from './channels';
export default [
  {
    id: 'slack', icon: 'hash', title: 'Slack', body: 'Escríbele por mensaje directo en Slack, desde tu escritorio o tu teléfono, también con imágenes y archivos.', format: 'Canal (Socket Mode)',
    guide: { title: 'Conectar Slack', steps: [
      'En api.slack.com/apps, crea una app, activa Socket Mode y genera un token de nivel de app (xapp-…) con connections:write.',
      'Agrega los scopes de bot chat:write, im:history, files:read y files:write, suscríbete al evento message.im y permite los mensajes en App Home. Instala la app en tu espacio de trabajo y copia el token del bot (xoxb-…).',
      'Abre Ajustes → Canales de chat → Slack → Agregar cuenta, pega los dos tokens y guarda. Luego envíale un mensaje directo al bot en Slack.',
    ], limit: 'Por ahora solo mensajes directos. La app tiene que estar abierta: los mensajes que se envían mientras está cerrada no se reciben.' },
  },
  {
    id: 'telegram', icon: 'send', title: 'Telegram', body: 'Crea un bot con @BotFather y chatea con él desde cualquier lugar, también con imágenes y archivos.', format: 'Canal (token de bot)',
    guide: { title: 'Conectar Telegram', steps: [
      'En Telegram, escríbele a @BotFather, envía /newbot y sigue las instrucciones. Copia el token de bot que te da.',
      'Abre Ajustes → Canales de chat → Telegram → Agregar cuenta, pega el token y guarda.',
      'Abre tu nuevo bot en Telegram y envíale un mensaje. Se conecta mediante long polling, así que tu computadora no necesita una dirección pública.',
    ], limit: 'Por ahora solo mensajes directos. Los mensajes que se envían mientras la app está cerrada se reciben al abrirla, si no tienen más de 24 horas.' },
  },
  {
    id: 'discord', icon: 'headset', title: 'Discord', body: 'Agrégalo a tu servidor y luego escríbele por mensaje directo desde el escritorio o la app de Discord.', format: 'Canal (token de bot)',
    guide: { title: 'Conectar Discord', steps: [
      'En el Discord Developer Portal, crea una aplicación, agrega un bot y copia su token.',
      'En OAuth2 → URL Generator, marca el scope bot y abre el enlace para agregar el bot a un servidor del que formes parte.',
      'Abre Ajustes → Canales de chat → Discord → Agregar cuenta, pega el token y guarda. Luego envíale un mensaje directo al bot.',
    ], limit: 'Por ahora solo mensajes directos. La app tiene que estar abierta: los mensajes que se envían mientras está cerrada no se reciben.' },
  },
] satisfies Channel[];
