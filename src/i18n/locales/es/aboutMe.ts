import type { TranslatedCatalog } from "../../index.js";
export default {
  "addedChannel": "✓ Agregado a Sobre mí: {line} (responde «deshacer» para revertirlo)",
  "changedChannel": "✓ Actualizado en Sobre mí: {line} (responde «deshacer» para revertirlo)",
  "removedChannel": "✓ Eliminado de Sobre mí: {line} (responde «deshacer» para revertirlo)",
  "undone": "Listo, se deshizo. Sobre mí volvió a como estaba.",
  "empty": "Escribe una frase primero",
  "tooLong": "Una línea puede tener como máximo 300 caracteres",
  "secret": "No se pueden guardar contraseñas, claves, tokens ni códigos",
  "idOrCard": "Los números de documento y de tarjetas bancarias no se pueden guardar en Sobre mí",
  "missing": "Esta línea ya no está",
  "stale": "Esta línea cambió, así que la sugerencia ya no aplica",
  "notUndoable": "Este cambio ya no se puede deshacer"
} satisfies TranslatedCatalog["aboutMe"];
