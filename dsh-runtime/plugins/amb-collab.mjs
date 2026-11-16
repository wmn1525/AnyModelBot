// anymodel bot: messaging between the user's bots (MIT, part of anymodel bot).
//
// Registers message_bot and bot_request for chat sessions. The host (bridge /dsh/collab) checks everything:
// the user is signed in to Modelflare and both bots use Modelflare models, the user asked for it, one bot per
// message, the daily limit, and that the call comes from a chat with the user (not a background task, a rule or
// a request another bot sent). The other bot works in the background in its own task session, which never gets
// these tools (amb-tasks denies them there and in subagents), so a request is passed on only one level.
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'amb-collab'
export const inject = ['tools']

function bridge() {
  const url = process.env.AMB_BRIDGE_URL
  const token = process.env.AMB_BRIDGE_TOKEN
  if (!url || !token) return undefined
  return async (path, body, signal) => {
    const res = await fetch(url + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw new Error(`bridge ${path} ${res.status}`)
    return res.json()
  }
}

const TEXT_OUT = {
  schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

export function apply(ctx) {
  const call = bridge()
  if (!call) return
  const botId = process.env.AMB_BOT_ID ?? ''
  const run = (op) => async (args, exec) => {
    const r = await call('/dsh/collab', { botId, sessionId: String(exec.agent?.session?.id ?? ''), op, args }, exec.signal)
    if (r?.error) throw new Error(String(r.error))
    return { text: String(r?.text ?? '') }
  }
  ctx.tools.register(defineTool({
    name: 'message_bot',
    description: 'Hand a request to another of the user\'s bots, only when the user asked for it here. It replies to you; check its work, then tell the user.',
    parameters: {
      bot: { type: 'string', required: true, description: 'Its name.' },
      task: { type: 'string', required: true, description: 'What to do, or the question.' },
      title: { type: 'string' },
      points: { type: 'string', description: '3-5 background points, one per line.' },
      files: { type: 'array', items: { type: 'string' }, description: 'Workspace paths.' },
      done_when: { type: 'string', description: 'Done criteria from the user\'s words.' },
      ask: { type: 'boolean', description: 'Only a question, no work.' },
    },
    output: TEXT_OUT,
    execute: run('send'),
  }))
  ctx.tools.register(defineTool({
    name: 'bot_request',
    description: 'Manage a request between bots: redo (after its reply), add (the user\'s addition), stop, continue (after it hit a limit).',
    parameters: {
      id: { type: 'string', description: 'Request id (h_…).' },
      action: { type: 'string', required: true, enum: ['redo', 'add', 'stop', 'continue'] },
      text: { type: 'string', description: 'redo: what to fix; add: the addition.' },
    },
    output: TEXT_OUT,
    execute: run('request'),
  }))
}
