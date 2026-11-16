import type { TranslatedCatalog } from "../../index.js";
export default {
  "addedChannel": "✓ Adicionado a Sobre mim: {line} (responda «desfazer» para reverter)",
  "changedChannel": "✓ Atualizado em Sobre mim: {line} (responda «desfazer» para reverter)",
  "removedChannel": "✓ Removido de Sobre mim: {line} (responda «desfazer» para reverter)",
  "undone": "Pronto, desfeito. Sobre mim voltou a ser como era.",
  "empty": "Escreva uma frase primeiro",
  "tooLong": "Uma linha pode ter no máximo 300 caracteres",
  "secret": "Senhas, chaves, tokens e códigos não podem ser salvos",
  "idOrCard": "Números de documentos e de cartões bancários não podem ser salvos em Sobre mim",
  "missing": "Esta linha não existe mais",
  "stale": "Esta linha mudou, então a sugestão não vale mais",
  "notUndoable": "Esta alteração não pode mais ser desfeita"
} satisfies TranslatedCatalog["aboutMe"];
