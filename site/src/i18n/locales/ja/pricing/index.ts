export default {
  eyebrow: "料金 · 従量課金",
  h2mark: "月額料金なし",
  h2rest: "。使った分だけお支払い。",
  lead: "AnyModelBot は無料のオープンソース。サブスクリプションもプラン分けもありません。モデルの利用料は Modelflare がトークン単位で請求し、料金表はすべて公開しています。",
  source:
    "料金は modelflare.dev/pricing から取得。取得日時：{fetchedAt}（UTC+8）、料金バージョン：{pricingVersion}。",
  stale:
    "{snapshotDate} 時点の料金です。更新できなかったため、最新の料金は modelflare.dev/pricing をご確認ください。",
  cards: {
    app: {
      tag: "AnyModelBot",
      price: "$0",
      unit: "/ ずっと無料",
      note: "無料・オープンソース（MIT）",
      points: [
        "デスクトップ、Docker、CLI はすべて無料",
        "サブスクリプションもプラン分けもなし",
        "自分で役割を決めたボットを、好きなだけ作成",
        "Modelflare に新規登録すると Bot クレジット $1 をプレゼント（AnyModelBot 専用）",
      ],
    },
    usage: {
      tag: "モデル利用料 · Modelflare が請求",
      unit: "/ 入力100万トークン",
      note: "例：{model}、既定ルート。出力は100万トークンあたり {output}。公式料金は {officialIn} / {officialOut}",
      points: [
        "入力と出力をそれぞれトークン単位で課金",
        "料金表を公開",
        "モデルはいつでも変更可能。料金もモデルに応じて変わります",
        "Modelflare のサブスクリプションなら、プランのクレジットの 10% を Bot クレジットとして追加",
      ],
      cta: "すべての料金を見る ↗",
    },
    month: {
      tag: "1か月の費用の目安",
      unit: "/ 月",
      note: "例：1日50メッセージ、1件あたり入力3,000・出力600トークン、{model} を使用。",
      points: [
        "下の計算機に自分の利用量を入力できます",
        "キャッシュ割引やリクエスト固有の倍率は含みません",
        "実際の請求額は Modelflare の明細が基準です",
      ],
      cta: "料金計算機を開く",
    },
  },
  contrast: {
    caption: "従量課金と月額プランの比較",
    head: [
      "",
      "従量課金（AnyModelBot + Modelflare）",
      "月額プラン（一般的な方式）",
    ],
    rows: [
      [
        "課金方法",
        "月額料金なし。使った分だけ支払い",
        "毎月定額。利用できる量はプランで決まる",
      ],
      [
        "使わなかった分",
        "固定費は発生しない",
        "通常、月の利用枠は繰り越されない",
      ],
      [
        "モデルの切り替え",
        "いつでも可能。料金はモデルに応じて変わる",
        "使えるモデルはプランに制限されることが多い",
      ],
      [
        "料金の示し方",
        "100万トークンあたりの単価を公開",
        "利用枠に対する相対的な倍率で示されることが多い",
      ],
    ],
    note: "「月額プラン」は一般的な月額制製品の方式を説明するもので、特定の製品や実際の料金を示すものではありません。",
  },
  table: {
    more: "全{textCount}テキストモデルの料金を見る →",
    caption:
      "Modelflare のテキストモデル料金（既定ルート、100万トークンあたりの米ドル）",
    col: {
      model: "モデル",
      route: "既定ルート",
      input: "入力 / 100万",
      output: "出力 / 100万",
      official: "公式料金（入力 / 出力）",
      vs: "公式料金比",
    },
    default: "既定",
    context: "コンテキスト {n}",
    showAll: "全{textCount}テキストモデルを表示",
    showFeatured: "おすすめのみ表示",
    search: "モデルを検索",
    allVendors: "すべての提供元",
    media:
      "画像・動画モデル（{mediaCount}件）の料金は modelflare.dev/pricing で確認できます ↗",
    expand: "{model} の全ルートを表示",
    detail: {
      route: "ルート",
      positioning: "特性",
      vs: "公式料金比",
      price: "入力 / 出力",
    },
    positioning: {
      stable: "安定性重視ルート",
      award: "価格重視ルート",
      campaign: "期間限定ルート",
      enterprise: "安定性重視ルート（承認済みの企業向け本番利用のみ）",
      other: "その他のルート",
    },
    unlock:
      "1回のチャージ US${amount} で利用可能（期間限定。Modelflare の条件が適用されます）",
    tiers:
      "1回のリクエストが {n} トークンを超えると、長文コンテキストの単価が適用されます：入力 {input} · 出力 {output}",
    none: "条件に合うモデルがありません。",
    note: "既定ルートの100万トークンあたりの米ドル料金です。Modelflare のページに記載のとおり、アカウントによって利用できるルートや割引が異なる場合があります。modelflare.dev/pricing から {fetchedAt}（UTC+8）に取得。料金バージョン：{pricingVersion}。",
  },
  calc: {
    title: "1か月の費用を計算",
    model: "モデル",
    search: "モデル名を入力して検索",
    none: "条件に合うモデルがありません。",
    route: "ルート",
    routeDefault: "既定ルート",
    routeAward: "価格重視ルート（award）",
    routeAwardNote: "リトライできる開発・テスト用途向け",
    msgs: "1日あたりのメッセージ数",
    inTok: "1メッセージあたりの入力トークン",
    inTokNote: "会話履歴とツールの結果も含みます",
    outTok: "1メッセージあたりの出力トークン",
    days: "30日間で計算",
    presets: {
      light: "少なめ",
      everyday: "日常利用",
      heavy: "多め（エージェント）",
    },
    hint: "1メッセージは、ボットが1回回答するまでのすべてのモデル呼び出しです。エージェントのタスクでは複数回呼び出すことがあります。",
    result: "約 {amount} / 月",
    split: "入力 {input} · 出力 {output}",
    perMsg: "1メッセージあたり約 {amount}",
    official: "公式料金では約 {amount}",
    disclaimer:
      "概算です。キャッシュ割引や優先サービスなどのリクエスト固有の倍率は含みません。モデルのトークン閾値を超えた場合の上位単価は反映しています。実際の請求額は Modelflare の明細をご確認ください。",
    copy: "計算結果をコピー",
    copyText:
      "AnyModelBot の利用料概算：{model}（{route}）、1日{msgs}メッセージ、1件あたり入力{inTok}・出力{outTok}トークン — 月額約{amount}（30日間、料金取得日：{fetchedAt}）",
    full: "このモデルの詳しい料金を見る ↗",
    expandBar: "詳細",
  },
  banner: {
    text: "Modelflare のアカウントをお持ちなら、アプリで一度ログインするだけ。利用料は公開料金表に従って計算されます。",
    cta: "Modelflare を開く ↗",
  },
  pageTitle: "AnyModelBot の料金 — 従量課金と公開料金表",
  pageDescription:
    "AnyModelBot は無料のオープンソースで、サブスクリプションは不要です。Modelflare のトークン単位の料金表と、月額費用の計算機をご覧いただけます。",
};
