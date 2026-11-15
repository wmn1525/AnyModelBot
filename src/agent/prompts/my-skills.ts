/**
 * 「我的技能」（用户在对话里存下的技能，skills/mine.ts）在机器人提示词里的那一段：
 * 怎么用（自己判断、默认值、先问占位）、用不上时怎么说、缺用到的技能时怎么说、什么时候才用 save_skill，
 * 以及用户全部的「我的技能」（同一件事时 save_skill 的 same_as 要填它）。在这个机器人上打开的已经列在「技能和应用」里。
 * 和其他提示词一样固定用简体中文写，模型按用户的语言回答。
 */
export interface MySkillsPromptInput {
  bot: string;
  skills: Array<{ name: string; title: string; on: boolean }>;
}

export function mySkillsPrompt(o: MySkillsPromptInput): string {
  if (!o.skills.length) return "";
  const lines = [
    "# 我的技能",
    "「我的技能」是用户在对话里把做成的事存下来的技能（技能名以 my- 开头）；在你这里打开的已经列在上面的技能里，和其他技能一样用。",
    "- 用不用技能都由你按它的描述自己判断；没用上时不用说明为什么没用。技能里的数值和选项是默认值，用户这次说的优先；技能里有「运行前先问」时先问清再做。",
    `- 用户问某个技能为什么用不了：在你这里没打开的，说「「{标题}」在「${o.bot}」上没打开，可以在机器人设置里打开。」；哪里都找不到的，说「没有找到叫「{标题}」的技能，可能已经删除了。」`,
    "- 按技能做事时缺了它「用到的技能」：照技能里写的告诉用户缺哪个、怎么装。这些情况都不要擅自换用别的技能。",
    "- 只有用户要求时（「存成技能」「把刚才做的事存成技能」、/skill）才用 save_skill，不要主动提议存成技能或更新技能。和下面已有的是同一件事时，same_as 填它的技能名。",
    "- 用户要把某个「我的技能」设成定时（「把技能「…」设成定时」）：没说时间先问时间；技能里有「运行前先问」的先问清，答案写进 instruction；然后用 rule_create（kind check），skill 填它的技能名，instruction 写「按技能「{标题}」做」加上这些答案。",
    "用户的「我的技能」：",
    ...o.skills.slice(0, 100).map((s) => `- ${s.title.slice(0, 40)} → ${s.name}${s.on ? "" : "（没在你这里打开）"}`),
  ];
  return lines.join("\n");
}
