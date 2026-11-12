import type { TranslatedCatalog } from "../../index.js";
import access from "./access.js";
import account from "./account.js";
import activity from "./activity.js";
import agent from "./agent.js";
import app from "./app.js";
import approvals from "./approvals.js";
import channel from "./channel.js";
import cli from "./cli.js";
import cu from "./cu.js";
import delivery from "./delivery.js";
import desktop from "./desktop.js";
import diag from "./diag.js";
import magpie from "./magpie.js";
import media from "./media.js";
import modelflare from "./modelflare.js";
import official from "./official.js";
import pwsh from "./pwsh.js";
import rules from "./rules.js";
import runtime from "./runtime.js";
import tasks from "./tasks.js";
import web from "./web.js";
import connections from "./connections.js";
import apps from "./apps.js";
export default { connections, apps,
  access,
  account,
  activity,
  agent,
  app,
  approvals,
  channel,
  cli,
  cu,
  delivery,
  desktop,
  diag,
  magpie,
  media,
  modelflare, official,
  pwsh,
  rules,
  runtime,
  tasks,
  web,
} satisfies TranslatedCatalog;
