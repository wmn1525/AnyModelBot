// anymodel bot: the work folder a message is bound to (MIT, part of anymodel bot).
//
// The user can choose a folder above the message box; every message is bound to the folder chosen when it was
// sent (src/folders/). DSH fixes a session's sandbox workspace at creation (the SDK records the launch cwd on every
// session header), so on its own every chat would stay confined to the bot's default workspace. Before each turn
// the host sends `folder {sessionId, root, unavailable?}` over the control channel (amb-control dispatches ops it
// does not know to the handlers on globalThis[Symbol.for('amb.control.handlers')]) and this plugin makes the
// sandbox policy resolve that session's workspace root to the bound folder. Every enforcing capability (the
// in-process file tools, bash / pwsh / terminal sandboxes on Linux, macOS and Windows) and the policy text the
// model sees read the same resolve(), so the folder is writable exactly where the default workspace used to be,
// and the default workspace is not writable for that turn. The permission mode is unchanged: read-only stays
// read-only, full access stays full access, approved escalations keep their explicit mode.
//
//   root: null          back to the session's own workspace (no folder chosen)
//   unavailable: true   the bound folder can no longer be confirmed (moved, replaced, no access): the turn runs
//                       read-only on the session's own workspace, so nothing is written to some other place
//
// Subagents (and their subagents) inherit the binding of the session they belong to (header.parentSession).
export const name = 'amb-workfolder'

const HANDLERS = Symbol.for('amb.control.handlers')
/** sessionId → { root?: string, unavailable?: boolean } */
const BINDINGS = Symbol.for('amb.session.folders')

export function apply(ctx) {
  const bindings = (globalThis[BINDINGS] ??= new Map())
  const handlers = (globalThis[HANDLERS] ??= {})
  handlers.folder = async ({ sessionId, root, unavailable }) => {
    const id = String(sessionId ?? '')
    if (!id) throw new Error('no session')
    if (unavailable) bindings.set(id, { unavailable: true })
    else if (typeof root === 'string' && root) bindings.set(id, { root })
    else bindings.delete(id)
    return { ok: true }
  }

  const agents = () => ctx.get('agents')
  /** the binding of this session, or of the session it was spawned from (up to 8 levels) */
  const bindingOf = (session) => {
    let s = session
    for (let i = 0; s && i < 8; i++) {
      const b = bindings.get(String(s.id ?? ''))
      if (b) return b
      const parent = s.header?.parentSession
      if (!parent) return undefined
      s = agents()?.get?.(String(parent))?.session
    }
    return undefined
  }

  ctx.inject?.(['sandboxPolicy'], (scope) => {
    const svc = scope.sandboxPolicy
    if (!svc || typeof svc.resolve !== 'function') return
    const original = svc.resolve
    const wrapped = function (request = {}) {
      const base = original.call(this, request)
      const b = request?.session ? bindingOf(request.session) : undefined
      if (!b) return base
      // an approved escalation (request.mode) keeps its mode; otherwise an unavailable folder means read-only
      if (b.unavailable) return request.mode ? base : { ...base, mode: base.mode === 'danger-full-access' ? base.mode : 'read-only' }
      return { ...base, workspaceRoot: b.root }
    }
    try {
      svc.resolve = wrapped
      scope.on?.('dispose', () => {
        try { if (svc.resolve === wrapped) svc.resolve = original } catch {}
      })
    } catch (e) {
      ctx.logger?.warn?.(`amb-workfolder: could not wrap the sandbox policy: ${e?.message ?? e}`)
    }
  })

  ctx.on?.('agent/disposed', ({ agent }) => {
    const id = String(agent?.id ?? '')
    if (id) bindings.delete(id)
  })
}
