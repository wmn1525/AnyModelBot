import type { TranslatedCatalog } from "../../index.js";
export default {
  "msgPoints": "背景：",
  "msgFiles": "関連ファイル：",
  "msgAskOnly": "作業は不要です。回答だけお願いします。",
  "msgDoneWhen": "完了の基準：{criteria}",
  "msgRedo": "{issue}。修正してください。（やり直し {n}/{limit}）",
  "msgAdds": "ユーザーからの追加：{text}",
  "whyUser": "あなたが停止を指示しました",
  "whyTimeout": "{limit} を超えました",
  "whyBudget": "この件で {budget} を使い切りました",
  "whyError": "エラーが発生しました：{reason}",
  "hours": {"other": "{count} 時間"},
  "minutes": {"other": "{count} 分"},
  "noText": "（説明なし）",
  "fallbackReply": "{bot}からのメッセージ：\n\n{text}",
  "fallbackStopped": "{bot}はいったん停止しました（{why}）。{text}",
  "droppedExpired": "{bot}が 24 時間以内に開始しなかったため、この件は取り消されました。",
  "droppedModel": "{bot}がご自身の API キーのモデルに切り替わったため、待機中のこの件は開始できず取り消しました。",
  "deleted": "{bot}が削除されたため、この件は停止しました。"
} satisfies TranslatedCatalog["collab"];
