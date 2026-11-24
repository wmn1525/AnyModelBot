export default {
  "facts": [
    {
      "text": "La consola escucha en 127.0.0.1 de forma predeterminada y verifica el encabezado Host; incluso el acceso local requiere un token de acceso.",
      "path": "src/web/server.ts"
    },
    {
      "text": "Las claves de los modelos nunca entran en el proceso del agente; la interfaz solo muestra los últimos 4 caracteres.",
      "path": "src/agent/bridge.ts · src/agent/host.ts"
    },
    {
      "text": "Los archivos y los comandos se ejecutan en un espacio de trabajo aislado, y todo lo que esté fuera requiere aprobación; en Linux, los comandos solo se ejecutan dentro de bubblewrap, que además oculta el directorio de datos, y se rechazan si no está disponible.",
      "path": "src/agent/host.ts"
    },
    {
      "text": "La memoria rechaza contraseñas, claves y números de identificación.",
      "path": "src/agent/memory.ts"
    },
    {
      "text": "Las variables de entorno de telemetría del controlador de uso de la computadora (Cua) se establecen en 0; la actualización automática de magpie está desactivada.",
      "path": "src/agent/cua-driver.ts · src/magpie/supervisor.ts"
    }
  ]
};
