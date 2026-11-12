export default {
  "title": "Segurança — okbot",
  "description": "Para onde vão os dados do okbot, as proteções locais e os limites conhecidos: o que fica no seu dispositivo e o que precisa sair dele.",
  "h1": "Segurança",
  "lead": "A versão completa do diagrama de fluxo de dados da página inicial: o que fica no seu dispositivo, o que precisa sair, as proteções que você pode verificar no código e as promessas que não fazemos.",
  "stays": "Fica no seu dispositivo",
  "leaves": "Sai do seu dispositivo",
  "leavesItems": [
    "O que você envia ao modelo (incluindo o conteúdo da tela durante o uso do computador) passa pelo gateway do OKINTO até o provedor que você escolher.",
    "As solicita??es aos modelos passam pela okinto; os logs, o cache e a reten??o seguem sua pol?tica de privacidade e as configura??es da conta.",
    "As mensagens no Slack, Telegram e Discord passam, por natureza, pelos servidores dessas plataformas.",
    "Se você conectar apps como Notion ou GitHub, ou adicionar um conector MCP personalizado, o que os bots leem e escrevem vai para esses serviços, e o que eles leem também entra nas solicitações aos modelos.",
    "Os instaladores do Windows e as AppImages do Linux baixam atualiza??es em segundo plano; voc? pode desativar isso nas Configura??es. A instala??o exige clicar em Reiniciar e atualizar e n?o ter tarefas em andamento. Os pacotes atuais do macOS s?o atualizados manualmente. As solicita??es n?o incluem credenciais nem conversas."
  ],
  "guardsTitle": "Proteções no código",
  "limitsTitle": "Limites e promessas que não fazemos",
  "limits": [
    "Não há modelos offline ou locais; as solicitações de inferência sempre saem do seu dispositivo.",
    "O uso do computador funciona automaticamente por padrão (dá para mudar para pedir confirmação antes de ações que alteram a interface); o modo direto do macOS não foi verificado em máquinas reais.",
    "O comportamento de rede do app não foi auditado por terceiros, por isso não afirmamos “telemetria zero”.",
    "Plataformas que não sejam Linux não têm a camada bubblewrap; a força do sandbox varia conforme a plataforma."
  ],
  "report": "Para sugest?es e colabora??o, entre em contato pelo GitHub Issues do projeto."
};
