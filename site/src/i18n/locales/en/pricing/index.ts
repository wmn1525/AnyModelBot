export default {
  "eyebrow": "PRICING · PAY PER USE",
  "h2mark": "No monthly fee",
  "h2rest": ". Pay only for what you use.",
  "lead": "AnyModelBot is free and open source — no subscription, no tiers. Model usage is billed by Modelflare per token, and the price list is fully public.",
  "source": "Prices come from modelflare.dev/pricing, fetched {fetchedAt} (UTC+8), version {pricingVersion}.",
  "stale": "Price snapshot dated {snapshotDate} (couldn't refresh; modelflare.dev/pricing is the source of truth).",
  "cards": {
    "app": {
      "tag": "AnyModelBot",
      "price": "$0",
      "unit": "/ forever",
      "note": "Free and open source (MIT)",
      "points": [
        "Desktop, Docker and CLI are all free",
        "No subscription, no plan tiers",
        "Create as many bots as you like, each one defined by you",
        "New Modelflare accounts get $1 in Bot credits, usable only in AnyModelBot"
      ]
    },
    "usage": {
      "tag": "Model usage · billed by Modelflare",
      "unit": "/ 1M input tokens",
      "note": "e.g. {model}, default route, output {output} per 1M tokens; official {officialIn} / {officialOut}",
      "points": [
        "Priced per token, input and output separately",
        "Public price list",
        "Switch models any time; price follows the model",
        "Modelflare subscriptions add Bot credits worth 10% of the plan"
      ],
      "cta": "See the full price list ↗"
    },
    "month": {
      "tag": "What a month costs",
      "unit": "/ month",
      "note": "Example: 50 messages/day, 3,000 input + 600 output tokens each, {model}.",
      "points": [
        "Plug your own usage into the calculator below",
        "Estimate excludes cache discounts and special request multipliers",
        "Modelflare's bill is the source of truth"
      ],
      "cta": "Open the calculator"
    }
  },
  "contrast": {
    "caption": "Pay per use compared with subscription tiers",
    "head": [
      "",
      "Pay per use (AnyModelBot + Modelflare)",
      "Subscription tiers (common approach)"
    ],
    "rows": [
      [
        "How it's billed",
        "Pay for what you use, no monthly fee",
        "Pay a monthly fee; the tier sets how much you can use"
      ],
      [
        "Unused portion",
        "No fixed spend",
        "The month's allowance usually doesn't roll over"
      ],
      [
        "Switching models",
        "Any time; price follows the model",
        "Available models are usually limited by tier"
      ],
      [
        "How prices read",
        "Per-1M-token rates, publicly listed",
        "Often stated as relative multiples of an allowance"
      ]
    ],
    "note": "“Subscription tiers” describes the common approach of monthly-tier products, not any specific product or its actual prices."
  },
  "table": {
    "more": "See prices for all {textCount} text models →",
    "caption": "Modelflare text model prices (default route, USD per 1M tokens)",
    "col": {
      "model": "Model",
      "route": "Default route",
      "input": "Input / 1M",
      "output": "Output / 1M",
      "official": "Official (in / out)",
      "vs": "vs official"
    },
    "default": "Default",
    "context": "{n} context",
    "showAll": "Show all {textCount} text models",
    "showFeatured": "Featured only",
    "search": "Search models",
    "allVendors": "All vendors",
    "media": "Image and video models ({mediaCount}) are listed at modelflare.dev/pricing ↗",
    "expand": "Show all routes for {model}",
    "detail": {
      "route": "Route",
      "positioning": "Positioning",
      "vs": "vs official",
      "price": "Input / output"
    },
    "positioning": {
      "stable": "High-stability route",
      "award": "Price-priority route",
      "campaign": "Limited-time route",
      "enterprise": "High-stability route (authorised enterprise production only)",
      "other": "Other route"
    },
    "unlock": "Unlocked by a single top-up of US${amount} (limited-time; Modelflare's rules apply)",
    "tiers": "Single requests above {n} tokens use the long-context tier: input {input} · output {output}",
    "none": "No matching models.",
    "note": "Prices are USD per 1M tokens for the default route; your account may have different access or discounts (as Modelflare's page notes). Data from modelflare.dev/pricing, fetched {fetchedAt} (UTC+8), version {pricingVersion}."
  },
  "calc": {
    "title": "Estimate your monthly cost",
    "model": "Model",
    "search": "Type to search models",
    "none": "No matching models.",
    "route": "Route",
    "routeDefault": "Default route",
    "routeAward": "Price-priority route (award)",
    "routeAwardNote": "Suited to retryable development and testing",
    "msgs": "Messages per day",
    "inTok": "Input tokens per message",
    "inTokNote": "Includes chat history and tool results",
    "outTok": "Output tokens per message",
    "days": "Estimated over 30 days",
    "presets": {
      "light": "Light",
      "everyday": "Everyday",
      "heavy": "Heavy (agent)"
    },
    "hint": "One message = all model calls behind one bot reply; an agent task can involve several calls.",
    "result": "≈ {amount} / month",
    "split": "input {input} · output {output}",
    "perMsg": "about {amount} per message",
    "official": "about {amount} at official prices",
    "disclaimer": "Estimate only. Excludes cache discounts and request-level multipliers (e.g. the priority service tier); requests above a model's tier threshold are priced at the higher tier (included); Modelflare's bill is the source of truth.",
    "copy": "Copy estimate",
    "copyText": "AnyModelBot usage estimate: {model} ({route}), {msgs} messages/day, {inTok} input + {outTok} output tokens each — about {amount}/month (30 days, prices fetched {fetchedAt})",
    "full": "See this model's full pricing ↗",
    "expandBar": "Details"
  },
  "banner": {
    "text": "Already have a Modelflare account? Sign in once in the app and go — usage is billed per the price list.",
    "cta": "Open Modelflare ↗"
  },
  "pageTitle": "AnyModelBot pricing — pay per use, public price list",
  "pageDescription": "AnyModelBot is free and open source with no subscription. Model usage is billed per token by Modelflare: the public price list and a monthly cost calculator."
};
