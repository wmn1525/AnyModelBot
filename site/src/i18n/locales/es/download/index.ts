export default {
  "warn": "No expongas el puerto 3600 directamente a internet.",
  "win": "Descargar para Windows",
  "mac": "Descargar para macOS",
  "linux": "Descargar para Linux",
  "mobile": "Úsalo desde tus apps de chat",
  "generic": "Descargar",
  "more": "Otras plataformas",
  "items": {
    "win-x64": "Instalador para Windows (NSIS)",
    "mac-arm64": "macOS Apple silicon",
    "mac-x64": "macOS Intel",
    "linux-x64": "AppImage para Linux",
    "docker": "Comando de Docker",
    "changelog": "Registro de cambios"
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
  "meta": "Versión {version} · Publicada el {publishedAt}",
  "sha": "SHA-256",
  "started": "La descarga comenzó; revisa las descargas de tu navegador.",
  "downloading": "Descargando…",
  "macNote": "El uso de la computadora en macOS está en beta: su modo directo todavía necesita pruebas en más equipos reales. Los permisos de Accesibilidad y Grabación de pantalla solo se solicitan cuando un bot los necesita por primera vez. El resto de la app es igual que en Windows y Linux.",
  "linuxHint": "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  "winHint": "Si Windows muestra una advertencia, elige “Más información” y luego “Ejecutar de todas formas”.",
  "macHint": "Firmada con Developer ID y notarizada por Apple. Arrastra la app a Aplicaciones, ábrela y elige “Abrir” si te pide confirmar la descarga.",
  "firstRun": "Primer inicio",
  "yourSystem": "Tu sistema",
  "verifyTitle": "Verifica la descarga",
  "verifyLead": "Ejecuta el comando para tu sistema y compara el SHA-256 con el valor que aparece aquí. Si coinciden, el archivo está intacto.",
  "verifyUnixLabel": "macOS / Linux",
  "verifyWin": "Get-FileHash .\\<archivo> -Algorithm SHA256",
  "verifyUnix": "shasum -a 256 <archivo>",
  "pageTitle": "Descargar okbot",
  "pageLead": "Gratis y de código abierto. La app en sí no requiere registro; inicia sesión en OKINTO la primera vez que la abras y listo.",
  "pageDescription": "Descarga okbot para Windows, macOS, Linux y Docker. Gratis y de código abierto, con pago por uso.",
  "altTitle": "Otras formas de ejecutarlo",
  "dockerTitle": "Docker",
  "dockerSteps": {
    "run": "Inicia el contenedor",
    "token": "Lee el token de acceso",
    "open": "Ábrelo en el navegador"
  },
  "dockerUrl": "http://<host>:3600/?token=<token>",
  "cliTitle": "Línea de comandos (CLI)",
  "cliBody": "Ejecútalo desde el código fuente. Requiere Node.js 22.13+ y Go 1.26.8+ (para compilar el gateway incluido).",
  "cliSteps": {
    "clone": "Clona el repositorio",
    "setup": "Instala las dependencias y compila el gateway",
    "start": "Inícialo y abre http://127.0.0.1:3600/"
  },
  "releases": "Versiones en GitHub",
  "changelog": "Registro de cambios"
};
