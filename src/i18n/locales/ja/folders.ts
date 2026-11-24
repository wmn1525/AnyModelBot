import type { TranslatedCatalog } from "../../index.js";
export default {
  err_notAllowed: "この場所は選べません。具体的なプロジェクトフォルダーを選んでください。",
  err_unavailable: "このフォルダーにアクセスできません。選び直してください。",
  err_system: "システムがこのフォルダーへのアクセスをブロックしています。アクセス権を確認してからもう一度お試しください。",
  err_desktopOnly: "ボットが動いているパソコンのデスクトップアプリでフォルダーを選んでください。",
  err_changed: "送信条件が変わりました。確認してからもう一度お試しください。",
  promptFolderGone: "[このメッセージに結び付いた作業フォルダー「{name}」は今は使えません（{reason}）。ほかの場所の同名ファイルを読み書きしたり別のフォルダーに切り替えたりせず、このターンではファイルを変更しないでください。フォルダーが使えなくなったので選び直してほしいとユーザーに伝えてください]",
  reasonUnavailable: "存在しないか、置き換えられたか、フォルダーではありません",
  reasonSystem: "システムがアクセスを許可していません",
  reasonNotAllowed: "この場所は作業フォルダーにできません",
} satisfies TranslatedCatalog["folders"];
