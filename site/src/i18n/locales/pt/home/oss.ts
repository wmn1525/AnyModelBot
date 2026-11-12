export default {
  "facts": [
    {
      "text": "Por padrão, o console escuta em 127.0.0.1 e verifica o cabeçalho Host; vincular um endereço que não seja de loopback exige um token de acesso.",
      "path": "src/web/server.ts"
    },
    {
      "text": "As chaves dos modelos nunca entram no processo do agente; a interface mostra só os últimos 4 caracteres.",
      "path": "src/agent/bridge.ts · src/agent/host.ts"
    },
    {
      "text": "Arquivos e comandos rodam em um espaço de trabalho isolado em sandbox, e qualquer coisa além dele exige aprovação; no Linux, o bubblewrap também oculta o diretório de dados.",
      "path": "src/agent/host.ts"
    },
    {
      "text": "A memória recusa senhas, chaves e números de documentos.",
      "path": "src/agent/memory.ts"
    },
    {
      "text": "As variáveis de ambiente de telemetria do driver de uso do computador (Cua) são definidas como 0; a atualização automática do magpie está desativada.",
      "path": "src/agent/cua-driver.ts · src/magpie/supervisor.ts"
    }
  ]
};
