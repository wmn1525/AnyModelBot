import type { TranslatedCatalog } from "../../index.js";
export default {
  err_notAllowed: "No se puede usar esta ubicación. Elige una carpeta de proyecto concreta.",
  err_unavailable: "No se puede acceder a esta carpeta. Vuelve a elegirla.",
  err_system: "El sistema bloqueó el acceso a esta carpeta. Revisa sus permisos de acceso e inténtalo de nuevo.",
  err_desktopOnly: "Elige una carpeta en la app de escritorio del equipo donde se ejecuta el bot.",
  err_changed: "Las condiciones de envío han cambiado. Revísalas e inténtalo de nuevo.",
  promptFolderGone: "[La carpeta de trabajo «{name}» de este mensaje ya no está disponible ({reason}): no leas ni escribas archivos con el mismo nombre en otro lugar ni cambies a otra carpeta, y no modifiques archivos en este turno. Dile al usuario que la carpeta ya no está disponible y que la vuelva a elegir.]",
  reasonUnavailable: "ya no existe, se reemplazó o no es una carpeta",
  reasonSystem: "el sistema bloquea el acceso",
  reasonNotAllowed: "esta ubicación no puede ser carpeta de trabajo",
} satisfies TranslatedCatalog["folders"];
