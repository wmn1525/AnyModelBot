export default {
  "title": "Seguridad — okbot",
  "description": "A dónde van los datos de okbot, las protecciones locales y los límites conocidos: qué se queda en tu dispositivo y qué tiene que salir de él.",
  "h1": "Seguridad",
  "lead": "La versión extendida del diagrama de flujo de datos de la página de inicio: qué se queda en tu dispositivo, qué tiene que salir, las protecciones que puedes verificar en el código y las promesas que no hacemos.",
  "stays": "Se queda en tu dispositivo",
  "leaves": "Sale de tu dispositivo",
  "leavesItems": [
    "Lo que envías al modelo (incluido el contenido de la pantalla durante el uso de la computadora) pasa por el gateway de OKINTO hasta el proveedor que elijas.",
    "Las solicitudes de modelos pasan por okinto; los registros, la cach? y la retenci?n dependen de su pol?tica de privacidad y de la configuraci?n de la cuenta.",
    "Por naturaleza, los mensajes de Slack, Telegram y Discord pasan por los servidores de esas plataformas.",
    "Si conectas apps como Notion o GitHub, o agregas un conector MCP personalizado, lo que los bots leen y escriben llega a esos servicios, y lo que leen también se incluye en las solicitudes al modelo.",
    "Los instaladores de Windows y las AppImages de Linux descargan actualizaciones en segundo plano; puedes desactivarlo en Ajustes. La instalaci?n requiere que pulses Reiniciar y actualizar y que no haya tareas en curso. Los paquetes actuales de macOS se actualizan manualmente. Las solicitudes no incluyen credenciales ni chats."
  ],
  "guardsTitle": "Protecciones en el código",
  "limitsTitle": "Límites y promesas que no hacemos",
  "limits": [
    "No hay modelos sin conexión ni locales; las solicitudes de inferencia siempre salen de tu dispositivo.",
    "El uso de la computadora funciona en automático de forma predeterminada (se puede cambiar para que pregunte antes de acciones que modifican la interfaz); el modo directo de macOS no se ha verificado en equipos reales.",
    "El comportamiento de red de la app no ha sido auditado por terceros, así que no afirmamos tener “cero telemetría”.",
    "Las plataformas distintas de Linux no tienen la capa de bubblewrap; la solidez del sandbox varía según la plataforma."
  ],
  "report": "Para comentarios y colaboraci?n, contacta al proyecto mediante GitHub Issues."
};
