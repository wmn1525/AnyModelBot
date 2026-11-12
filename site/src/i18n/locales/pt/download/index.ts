export default {
  "warn": "Não exponha a porta 3600 diretamente à internet.",
  "win": "Baixar para Windows",
  "mac": "Baixar para macOS",
  "linux": "Baixar para Linux",
  "mobile": "Use nos seus apps de chat",
  "generic": "Baixar",
  "more": "Outras plataformas",
  "items": {
    "win-x64": "Instalador para Windows (NSIS)",
    "mac-arm64": "macOS Apple silicon",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    "docker": "Comando Docker",
    "changelog": "Registro de alterações"
  },
  "platform": {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux"
  },
  "arch": {
    "win-x64": "x64",
    "mac-arm64": "Apple silicon",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage"
  },
  "meta": "Versão {version} · Publicada em {publishedAt}",
  "sha": "SHA-256",
  "started": "Download iniciado — confira os downloads do navegador.",
  "downloading": "Baixando…",
  "macNote": "O uso do computador no macOS está em beta: o modo direto ainda precisa ser testado em mais máquinas reais. As permissões de Acessibilidade e Gravação de Tela só são solicitadas quando um bot precisa delas pela primeira vez. O restante do app é igual ao do Windows e do Linux.",
  "linuxHint": "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  "winHint": "Se o Windows exibir um aviso, clique em Mais informações e depois em Executar assim mesmo.",
  "macHint": "Assinado com Developer ID e notarizado pela Apple. Arraste o app para Aplicativos, abra-o e escolha Abrir se o sistema pedir para confirmar o download.",
  "firstRun": "Primeira execução",
  "yourSystem": "Seu sistema",
  "verifyTitle": "Verifique seu download",
  "verifyLead": "Execute o comando do seu sistema e compare o SHA-256 com o valor indicado aqui. Se forem iguais, o arquivo está íntegro.",
  "verifyUnixLabel": "macOS / Linux",
  "verifyWin": "Get-FileHash .\\<arquivo> -Algorithm SHA256",
  "verifyUnix": "shasum -a 256 <arquivo>",
  "pageTitle": "Baixar o okbot",
  "pageLead": "Grátis e de código aberto. O app em si não exige cadastro: entre no OKINTO na primeira execução e pronto.",
  "pageDescription": "Baixe o okbot para Windows, macOS, Linux e Docker. Grátis, de código aberto e com pagamento por uso.",
  "altTitle": "Outras formas de executar",
  "dockerTitle": "Docker",
  "dockerSteps": {
    "run": "Inicie o contêiner",
    "token": "Leia o token de acesso",
    "open": "Abra no navegador"
  },
  "dockerUrl": "http://<host>:3600/?token=<token>",
  "cliTitle": "Linha de comando (CLI)",
  "cliBody": "Execute a partir do código-fonte. Requer Node.js 22.13+ e Go 1.26.8+ (para compilar o gateway incluído).",
  "cliSteps": {
    "clone": "Clone o repositório",
    "setup": "Instale as dependências e compile o gateway",
    "start": "Inicie e abra http://127.0.0.1:3600/"
  },
  "releases": "Releases no GitHub",
  "changelog": "Registro de alterações"
};
