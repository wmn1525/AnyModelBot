/**
 * 任务库（PRD 2026-11-15）：列出任务（当前界面语言的文案、默认时间、每月次数、依赖、搜索用的字）和「已在用」，
 * 按参数写出规则的名称和原话（弹窗里的「看看会怎么交代机器人」），「打开」「先试一次」，以及试跑的结果和停止。
 * 依赖（应用连没连、群在不在、机器人的状态）由界面就地判断，保存时服务端再查一次。
 */
import { lang, t } from "../../i18n/index.js";
import { normalizeSchedule, parseSchedule, previewSchedule, type Schedule } from "../../tasks/schedule.js";
import { defaultWhen, draftRule, libraryStrings, libraryTask, libraryTasks, searchText, sameParams } from "../../tasks/library.js";
import { HttpError, readJson, send, type Route, type WebContext } from "../http.js";

export function routinesRoutes(ctx: WebContext): Route {
  const { app } = ctx;
  const scheduleOf = (raw: unknown): Schedule | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const now = Date.now();
    const b = raw as Record<string, unknown>;
    const r = b?.kind === "once" && typeof b.local === "string"
      ? parseSchedule(`once ${b.local.replace("T", " ")}`, typeof b.tz === "string" ? b.tz : app.delivery.timeZone, now)
      : normalizeSchedule(raw, app.delivery.timeZone, now);
    if (!r.schedule) throw new HttpError(400, r.error || t("rules.badSchedule"));
    return r.schedule;
  };
  const groupsOf = (botId: string) => app.store.listGroups().filter((g) => g.members.includes(botId)).map((g) => ({ id: g.id, name: g.name }));
  return async (req, res, url, seg, _p, m) => {
    if (seg[0] !== "routines") return false;
    const l = lang();
    if (seg.length === 1 && m === "GET") {
      const now = Date.now();
      const tz = app.delivery.timeZone;
      const strings = libraryStrings(l);
      const tasks = libraryTasks().map((task) => {
        const c = strings.tasks[task.id];
        const when = defaultWhen(task, l, tz, now);
        return {
          id: task.id, version: task.version, category: task.category, rank: task.rank, kind: task.kind, resultStyle: task.resultStyle, quiet: task.quietWhenNothing,
          icon: task.icon, hidden: !!task.hidden, fallback: task.fallback, suggestedTemplate: task.suggestedTemplate, replacesTemplateRule: !!task.replacesTemplateRule,
          title: c.title, oneLine: c.oneLine, audience: c.audience, steps: c.steps, sample: c.sample,
          when: when.text, monthlyRuns: when.monthlyRuns, yearly: !!when.yearly,
          needs: { web: !!task.needs.web, apps: task.needs.apps ?? [], group: !!task.needs.group },
          params: task.params.map((p) => {
            const pc = c.params[p.key] ?? { label: p.key };
            return {
              key: p.key, type: p.type, required: !!p.required, max: p.max, min: p.min, maxItems: p.maxItems,
              default: p.prefill ? pc.prefill : p.default, label: pc.label, placeholder: pc.placeholder ?? "",
              ...(p.options ? { options: p.options.map((value) => ({ value, label: pc.options?.[value] ?? value })) } : {}),
            };
          }),
          search: searchText(task, l),
        };
      });
      // 「已在用」：现存的规则按来源任务数（撤销了、还能恢复的不算）
      const usage: Record<string, Array<{ ruleId: string; botId: string }>> = {};
      for (const r of app.store.listRules({ limit: 500 })) if (r.source?.id) (usage[r.source.id] ??= []).push({ ruleId: r.id, botId: r.botId });
      // 最近聊过的机器人（「给哪个机器人」的默认值）：每个机器人最后一条用户消息的时间
      const recent = Object.fromEntries((app.store.db.prepare("SELECT c.bot_id AS bot, MAX(m.created_at) AS at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.role = 'user' GROUP BY c.bot_id").all() as Array<{ bot: string; at: number }>).map((x) => [x.bot, Number(x.at) || 0]));
      return send(res, 200, { tasks, usage, recent, timeZone: tz });
    }
    if (seg[1] === "draft" && m === "POST") {
      const b = await readJson(req);
      const task = libraryTask(String(b.taskId ?? ""));
      if (!task) throw new HttpError(404, t("rules.libraryMissing"));
      const botId = String(b.botId ?? "");
      const groups = botId ? groupsOf(botId) : [];
      const now = Date.now();
      const d = draftRule(task, b.params && typeof b.params === "object" ? b.params : {}, { lang: l, tz: app.delivery.timeZone, now, groups });
      const duplicate = botId ? app.store.listRules({ botId }).find((r) => r.source?.id === task.id && sameParams(r.source.params, d.values) && r.id !== b.ruleId) : undefined;
      return send(res, 200, {
        title: d.title, instruction: d.instruction, message: d.message, kind: d.kind, resultStyle: d.resultStyle, values: d.values, errors: d.errors,
        ...(d.schedule ? { schedule: d.schedule, ...previewSchedule(d.schedule, now) } : {}),
        ...(duplicate ? { duplicate: duplicate.id } : {}),
      });
    }
    if (seg[1] === "save" && m === "POST") {
      const b = await readJson(req);
      const r = await app.tasks.saveRoutine({
        taskId: String(b.taskId ?? ""),
        params: b.params && typeof b.params === "object" ? b.params : {},
        botId: String(b.botId ?? ""),
        conversationId: typeof b.conversationId === "string" ? b.conversationId : undefined,
        schedule: scheduleOf(b.schedule),
        missedPolicy: b.missedPolicy === "skip" ? "skip" : "catchup",
        ...(b.runBudgetUsd !== undefined ? { runBudgetUsd: Number(b.runBudgetUsd) } : {}),
        ...(b.monthBudgetUsd !== undefined ? { monthBudgetUsd: Number(b.monthBudgetUsd) } : {}),
        on: b.on === true && b.trial !== true,
        ruleId: typeof b.ruleId === "string" && b.ruleId ? b.ruleId : undefined,
        templateRule: b.templateRule === true,
        force: b.force === true,
        lang: l,
      });
      if (r.duplicate) return send(res, 200, { duplicate: app.tasks.getRuleView(r.duplicate.id) });
      // 机器人在弹窗打开期间被删了：410，界面刷新下拉、让用户换一个
      if (!r.rule) throw new HttpError(r.code === "bot_gone" ? 410 : 400, r.error ?? t("rules.createFailed"));
      if (b.trial === true) {
        const trial = app.tasks.trialRule(r.rule.id);
        if (trial.error) return send(res, 200, { rule: app.tasks.getRuleView(r.rule.id), trialError: trial.error });
        return send(res, 200, { rule: app.tasks.getRuleView(r.rule.id), run: trial.run?.id });
      }
      return send(res, 200, { rule: app.tasks.getRuleView(r.rule.id) });
    }
    if (seg[1] === "trial" && seg.length === 3) {
      const rule = app.store.getRule(decodeURIComponent(seg[2]));
      if (!rule || rule.undoneUntil) throw new HttpError(404, t("rules.notFound"));
      if (m === "GET") {
        const id = url.searchParams.get("run") || "";
        const run = app.tasks.ruleLog(rule.id, { limit: 20 }).find((x) => x.id === id);
        if (!run) throw new HttpError(404, t("rules.runNotFound"));
        return send(res, 200, { run, rule: app.tasks.getRuleView(rule.id) });
      }
      if (m === "DELETE") return send(res, 200, { stopped: app.tasks.stopTrial(rule.id) });
    }
    throw new HttpError(404, "not found");
  };
}
