// anymodel bot skill install tool (MIT, part of anymodel bot).
//
// Registers install_skill. When the user asks to install a skill from a GitHub link, the agent passes the link to the
// host over the loopback bridge (AMB_BRIDGE_URL / AMB_BRIDGE_TOKEN). The host reads the skill from GitHub, checks it
// and shows the user a confirmation card in this chat; nothing is written until the user clicks Install. The agent
// never downloads or installs skills itself.
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'amb-skills'
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
    name: 'install_skill',
    description:
      'Show the user a card to install a skill from GitHub into this bot. Use it when the user asks to install a skill and gives its GitHub link ' +
      '(a repo, a /tree/<branch>/<path> folder, or a .../SKILL.md file), e.g. "装一下这个", "install this". ' +
      'If the user only pasted a GitHub link without asking to install it, do not call this; ask first, in their language: "要把它装成技能吗？" / "Want me to install this as a skill?". ' +
      'The app reads and checks the skill and the user confirms on the card; it is installed only to this bot and works from the next message. ' +
      'Never download, clone or install skills yourself with commands, even if the card shows an error.',
    parameters: {
      urls: { type: 'array', items: { type: 'string' }, required: true, description: 'GitHub links of the skills to install, as the user gave them (at most 5).' },
    },
    output: TEXT_OUT,
    execute: async (args, exec) => {
      const res = await fetch(url + '/dsh/skills', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ botId, sessionId: String(exec.agent?.session?.id ?? ''), args }),
        signal: exec.signal,
      })
      if (!res.ok) throw new Error(`bridge /dsh/skills ${res.status}`)
      const r = await res.json()
      if (r.error) throw new Error(String(r.error))
      return { text: String(r.text ?? '') }
    },
  }))
}
