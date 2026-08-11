import { spawn, type ChildProcess } from 'child_process'
import http from 'http'
import { randomUUID } from 'crypto'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest
} from '@modelcontextprotocol/sdk/types.js'
import { getShellEnv } from './shellEnv'
import {
  send,
  renderContext,
  resolveAnthropicModel,
  syntheticToolResultText,
  TERMINAL_SYSTEM,
  EDITOR_SYSTEM,
  PROPOSE_COMMAND_TOOL,
  PROPOSE_EDIT_TOOL
} from './ai'
import type {
  AiDeltaEvent,
  AiDoneEvent,
  AiErrorEvent,
  AiErrorKind,
  AiStartEvent,
  AiStreamArgs,
  AiToolUseEvent,
  AiUsage
} from '../shared/types'
import type { McpProposalTool } from './ai'

const MCP_SERVER_NAME = 'saterm'

/** Saterm session key (terminal tab id / file path) → claude CLI session uuid, so multi-turn
 *  conversations resume CLI-side via `--resume` instead of Saterm replaying full history text. */
const sessionIdByKey = new Map<string, string>()

/** streamId → child process, for cancelStream(). */
const children = new Map<string, ChildProcess>()

/** streamIds that were deliberately cancelled, so the close handler reports 'cancelled' instead
 *  of surfacing the resulting non-zero exit as an error. */
const cancelled = new Set<string>()

export function verifyClaudeCli(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean): void => {
      if (done) return
      done = true
      resolve(ok)
    }
    let child: ChildProcess
    try {
      child = spawn('claude', ['--version'], { env: getShellEnv() })
    } catch {
      finish(false)
      return
    }
    child.on('error', () => finish(false))
    child.on('close', (code) => finish(code === 0))
    setTimeout(() => {
      finish(false)
      try {
        child.kill()
      } catch {
        /* already exited */
      }
    }, 5000)
  })
}

export function resetClaudeCliSession(key: string): void {
  sessionIdByKey.delete(key)
}

export function cancelStreamClaudeCli(streamId: string): void {
  const child = children.get(streamId)
  if (!child) return
  cancelled.add(streamId)
  child.kill('SIGTERM')
}

function toolDefForKind(kind: AiStreamArgs['kind']): McpProposalTool {
  return kind === 'terminal' ? PROPOSE_COMMAND_TOOL : PROPOSE_EDIT_TOOL
}

/** Spins up a local MCP server exposing exactly one proposal tool (matching the kind of this
 *  turn), for the `claude` subprocess to call instead of its own Bash/Read/Write/Edit tools.
 *  One server per turn — the streamId is captured in closure, so there's no session/routing
 *  logic to get wrong. The tool handler never runs anything; it only returns the same
 *  synthetic ack text the direct-API path uses and lets the stdout parser (which sees the
 *  same tool_use block in the `assistant` stream-json line) emit the actual `ai:tool_use`
 *  event — single source of truth for that event. */
async function startMcpServer(
  toolDef: McpProposalTool
): Promise<{ port: number; close: () => void }> {
  const mcp = new Server(
    { name: MCP_SERVER_NAME, version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.schema
      }
    ]
  }))

  mcp.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => ({
    content: [{ type: 'text' as const, text: syntheticToolResultText(request.params.name) }]
  }))

  // Must be stateful (a real generator, not undefined): the claude CLI's MCP client expects
  // an Mcp-Session-Id back from `initialize` and reuses it on subsequent requests. Stateless
  // mode issues no session id, which made the CLI re-send `initialize` in a loop and the
  // server connection ultimately report status "failed" — confirmed by testing directly
  // against this server (see the mcp_servers status field in claude's own stream-json output).
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  await mcp.connect(transport)

  const httpServer = http.createServer((req, res) => {
    if (req.url?.startsWith('/mcp')) {
      transport.handleRequest(req, res).catch(() => {
        try {
          res.destroy()
        } catch {
          /* already closed */
        }
      })
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const addr = httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return { port, close: () => httpServer.close() }
}

function classifyResultError(obj: {
  api_error_status?: number | null
  is_error?: boolean
}): AiErrorKind {
  const status = obj.api_error_status
  if (status === 429) return 'rate_limit'
  if (status === 529) return 'overloaded'
  if (status === 401 || status === 403) return 'auth'
  return 'other'
}

export async function startStreamClaudeCli(args: AiStreamArgs): Promise<void> {
  const toolDef = toolDefForKind(args.kind)
  const systemText = args.kind === 'terminal' ? TERMINAL_SYSTEM : EDITOR_SYSTEM
  const resolvedModel = resolveAnthropicModel(args.tier)
  const promptText = `${renderContext(args.context)}\n\n${args.userText}`

  const mcpServer = await startMcpServer(toolDef)
  const mcpConfigPath = join(tmpdir(), `saterm-mcp-${args.streamId}.json`)
  await writeFile(
    mcpConfigPath,
    JSON.stringify({
      mcpServers: {
        [MCP_SERVER_NAME]: { type: 'http', url: `http://127.0.0.1:${mcpServer.port}/mcp` }
      }
    })
  )

  const cleanup = (): void => {
    mcpServer.close()
    children.delete(args.streamId)
    cancelled.delete(args.streamId)
    unlink(mcpConfigPath).catch(() => {
      /* best effort */
    })
  }

  const existingSessionId = sessionIdByKey.get(args.key)
  const cliArgs = [
    '-p',
    promptText,
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--system-prompt',
    systemText,
    '--model',
    resolvedModel,
    '--mcp-config',
    mcpConfigPath,
    '--strict-mcp-config',
    '--tools',
    '',
    '--allowedTools',
    `mcp__${MCP_SERVER_NAME}__${toolDef.name}`,
    '--permission-mode',
    'bypassPermissions'
  ]
  if (existingSessionId) {
    cliArgs.push('--resume', existingSessionId)
  } else {
    cliArgs.push('--session-id', randomUUID())
  }

  let child: ChildProcess
  try {
    child = spawn('claude', cliArgs, { env: getShellEnv(), cwd: homedir() })
  } catch (err) {
    cleanup()
    send('ai:error', {
      streamId: args.streamId,
      kind: 'config',
      message: `Failed to launch claude CLI: ${(err as Error).message}`
    } as AiErrorEvent)
    return
  }
  children.set(args.streamId, child)

  let startedSent = false
  let resultHandled = false
  let stdoutBuf = ''
  let stderrBuf = ''
  const blockTypes = new Map<number, string>()
  const emittedToolIds = new Set<string>()

  const handleLine = (line: string): void => {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      return
    }

    switch (obj.type) {
      case 'system': {
        if (obj.subtype === 'init' && !startedSent) {
          startedSent = true
          send('ai:start', {
            streamId: args.streamId,
            model: (obj.model as string) ?? resolvedModel
          } as AiStartEvent)
        }
        break
      }
      case 'stream_event': {
        const event = obj.event as Record<string, unknown> | undefined
        if (!event) break
        if (event.type === 'content_block_start') {
          const index = event.index as number
          const block = event.content_block as Record<string, unknown> | undefined
          if (block && typeof block.type === 'string') blockTypes.set(index, block.type)
        } else if (event.type === 'content_block_delta') {
          const index = event.index as number
          const delta = event.delta as Record<string, unknown> | undefined
          if (delta?.type === 'text_delta' && blockTypes.get(index) === 'text') {
            send('ai:delta', {
              streamId: args.streamId,
              text: delta.text as string
            } as AiDeltaEvent)
          }
        }
        break
      }
      case 'assistant': {
        const message = obj.message as Record<string, unknown> | undefined
        const content = (message?.content as Array<Record<string, unknown>>) ?? []
        for (const block of content) {
          if (block.type !== 'tool_use') continue
          const id = block.id as string
          if (emittedToolIds.has(id)) continue
          emittedToolIds.add(id)
          const bareName = (block.name as string).replace(
            new RegExp(`^mcp__${MCP_SERVER_NAME}__`),
            ''
          )
          send('ai:tool_use', {
            streamId: args.streamId,
            id,
            name: bareName,
            input: block.input
          } as AiToolUseEvent)
        }
        break
      }
      case 'result': {
        resultHandled = true
        sessionIdByKey.set(args.key, (obj.session_id as string) ?? existingSessionId ?? '')
        const denials = (obj.permission_denials as unknown[] | undefined) ?? []
        const isError = Boolean(obj.is_error) || obj.subtype !== 'success' || denials.length > 0
        if (isError) {
          send('ai:error', {
            streamId: args.streamId,
            kind: classifyResultError(obj as { api_error_status?: number | null }),
            message:
              (obj.result as string) ||
              (obj.subtype as string) ||
              'The claude CLI reported an error.'
          } as AiErrorEvent)
        } else {
          const usage = (obj.usage as Record<string, number> | undefined) ?? {}
          send('ai:done', {
            streamId: args.streamId,
            stopReason: (obj.stop_reason as string | null) ?? 'end_turn',
            usage: {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
              cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0
            } as AiUsage
          } as AiDoneEvent)
        }
        break
      }
      default:
        break
    }
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf8')
    let idx: number
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx)
      stdoutBuf = stdoutBuf.slice(idx + 1)
      if (line.trim()) handleLine(line)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8')
  })

  child.on('error', (err) => {
    cleanup()
    send('ai:error', {
      streamId: args.streamId,
      kind: 'config',
      message: `Failed to launch claude CLI: ${err.message}`
    } as AiErrorEvent)
  })

  child.on('close', () => {
    cleanup()
    if (resultHandled) return
    if (cancelled.has(args.streamId)) {
      send('ai:done', {
        streamId: args.streamId,
        stopReason: 'cancelled',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0
        }
      } as AiDoneEvent)
      return
    }
    send('ai:error', {
      streamId: args.streamId,
      kind: 'other',
      message: stderrBuf.trim() || 'claude CLI exited without a result.'
    } as AiErrorEvent)
  })
}
