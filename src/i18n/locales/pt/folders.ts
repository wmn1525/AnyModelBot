import type { TranslatedCatalog } from "../../index.js";
export default {
  err_notAllowed: "Este local não pode ser usado. Escolha uma pasta de projeto específica.",
  err_unavailable: "Não é possível acessar esta pasta. Escolha-a de novo.",
  err_system: "O sistema bloqueou o acesso a esta pasta. Verifique as permissões de acesso e tente de novo.",
  err_desktopOnly: "Escolha uma pasta no app de desktop do computador onde o bot roda.",
  err_changed: "As condições de envio mudaram. Verifique e tente de novo.",
  promptFolderGone: "[A pasta de trabalho \"{name}\" desta mensagem não está mais disponível ({reason}): não leia nem grave arquivos de mesmo nome em outro lugar, não troque de pasta e não altere arquivos nesta rodada. Diga ao usuário que a pasta não está mais disponível e que a escolha de novo.]",
  reasonUnavailable: "não existe mais, foi substituída ou não é uma pasta",
  reasonSystem: "o sistema bloqueia o acesso",
  reasonNotAllowed: "este local não pode ser pasta de trabalho",
} satisfies TranslatedCatalog["folders"];
