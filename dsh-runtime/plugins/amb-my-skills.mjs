// anymodel bot "save as skill" tool (MIT, part of anymodel bot).
//
// Registers save_skill. When the user asks to save what was just done as a skill ("存成技能", /skill), the agent
// writes the draft (title, file name, when to use it, the steps that worked, the user's corrections, an example
// sentence, where it got stuck) and passes it to the host over the loopback bridge (AMB_BRIDGE_URL /
// AMB_BRIDGE_TOKEN). The host adds what it recorded from the tool calls (apps, skills, steps scheduled runs can't
// do), removes secrets, marks personal details and shows the user a draft card in this chat; nothing is written
// until the user clicks Save. The agent never writes skill files itself.
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'amb-my-skills'
export const inject = ['tools']

const TEXT_OUT = {
  schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

export function apply(ctx) {
  const url = process.env.AMB_BRIDGE_URL
  const token = process.env.AMB_BRIDGE_TOKEN
  if (!url || !token) return
  const botId = process.env.AMB_BOT_ID ?? ''

  ctx.tools.register(defineTool({
    name: 'save_skill',
    description:
      'Show the user a draft card that saves what was done in this chat as a skill in their "My skills". Call it only when the user asks to save it as a skill ' +
      '(e.g. "存成技能", "把刚才做的事存成技能", "save this as a skill"), or asks to change a draft you already showed: then call it again with the whole revised draft (the old card stops working). ' +
      'Never suggest or call it on your own. If you are in the middle of a task, finish it first. ' +
      'Write every field in the user\'s language, from what actually happened in this chat: the steps that worked in order (not the dead ends), the user\'s corrections turned into rules, and where it got stuck if the task did not finish. ' +
      'If the user wants only part of it ("把步骤 3 存成技能"), include only that part. Refer to apps by the account names the user connected; give values as defaults. ' +
      'Never put API keys, tokens, passwords, verification codes or cookies in any field. The user reviews and saves on the card; never write skill files yourself.',
    parameters: {
      title: { type: 'string', required: true, description: 'Short name shown in the app, in the user\'s language, at most 20 characters, e.g. 整理周报.' },
      name: { type: 'string', required: true, description: 'File name: lowercase English words joined by single hyphens, e.g. weekly-report. The app adds the my- prefix.' },
      description: { type: 'string', required: true, description: 'When to use this skill, one or two sentences in the user\'s language. You will later decide from it whether to use the skill.' },
      steps: { type: 'array', items: { type: 'string' }, required: true, description: 'The steps that worked, in order, one line each.' },
      corrections: {
        type: 'array',
        description: 'What the user corrected along the way.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            quote: { type: 'string', required: true, description: 'The user\'s words, verbatim.' },
            rule: { type: 'string', required: true, description: 'The correction rewritten as a rule for next time.' },
          },
        },
      },
      notes: { type: 'array', items: { type: 'string' }, description: 'Other things to watch out for, one line each.' },
      example: { type: 'string', required: true, description: 'One sentence the user could say next time to use this skill, in their own voice and without personal details, e.g. 用整理周报帮我整理这周的周报.' },
      unfinished_step: { type: 'string', description: 'Only if the task did not finish: the step where it got stuck.' },
      personal: {
        type: 'array',
        description: 'Personal details that appear in the fields above: people\'s names, group chat names, phone numbers, emails, ID numbers, file paths outside the workspace.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true, description: 'Exactly as written in the fields above.' },
            kind: { type: 'string', enum: ['name', 'group', 'phone', 'email', 'path', 'other'] },
            label: { type: 'string', description: 'What to ask the user for instead, e.g. 收件人.' },
          },
        },
      },
      same_as: { type: 'string', description: 'If this is the same task as one of the user\'s My skills (listed in your instructions), its file name, so the card offers to update it.' },
    },
    output: TEXT_OUT,
    execute: async (args, exec) => {
      const res = await fetch(url + '/dsh/skills', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'save', botId, sessionId: String(exec.agent?.session?.id ?? ''), args }),
        signal: exec.signal,
      })
      if (!res.ok) throw new Error(`bridge /dsh/skills ${res.status}`)
      const r = await res.json()
      if (r.error) throw new Error(String(r.error))
      return { text: String(r.text ?? '') }
    },
  }))
}
