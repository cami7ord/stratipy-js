import type { Attachment, StratipyError } from "./types"

const DEFAULT_API_URL = "https://api.stratipy.com"

interface CoreOptions {
  instanceId: string
  apiKey: string
  apiUrl?: string
}

function baseUrl(opts: CoreOptions): string {
  return (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "")
}

async function errorFromResponse(res: Response): Promise<StratipyError> {
  let message = res.statusText
  let code: string | undefined
  try {
    const body = await res.json()
    message = body.message ?? body.error ?? message
  } catch {
    // use statusText
  }
  if (res.status === 402) code = "insufficient_credits"
  return { status: res.status, message, code }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await errorFromResponse(res)
  return res.json() as Promise<T>
}

export interface ConversationCreated {
  conversationId: string
  instanceId: string
  strategyId: string
}

export async function createConversation(
  opts: CoreOptions,
  config?: Record<string, string>
): Promise<ConversationCreated> {
  const url = `${baseUrl(opts)}/strategies/instances/${opts.instanceId}/conversations`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-api-key": opts.apiKey,
    },
    body: JSON.stringify({ config: config ?? {} }),
  })
  return handleResponse<ConversationCreated>(res)
}

export async function sendMessage(
  opts: CoreOptions,
  conversationId: string,
  text: string,
  attachments?: Attachment[]
): Promise<void> {
  const url = `${baseUrl(opts)}/strategies/instances/${opts.instanceId}/conversations/${conversationId}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-api-key": opts.apiKey,
    },
    body: JSON.stringify({ text, attachments: attachments ?? [] }),
  })
  if (!res.ok) {
    await handleResponse(res)
  }
}

export async function cancelConversation(
  opts: CoreOptions,
  conversationId: string
): Promise<void> {
  const url = `${baseUrl(opts)}/strategies/instances/${opts.instanceId}/conversations/${conversationId}/cancel`
  try {
    await fetch(url, {
      method: "POST",
      headers: { "X-api-key": opts.apiKey },
    })
  } catch {
    // best-effort, swallow errors
  }
}

import type { RichContent } from "./types"

export interface SSEMessage {
  text: string
  richContent?: RichContent
}

export interface SSECallbacks {
  onMessage: (message: SSEMessage) => void
  onFinish: () => void
  onError: (error: StratipyError) => void
}

export interface SSEConnection {
  close(): void
}

export function connectSSE(
  opts: CoreOptions,
  conversationId: string,
  callbacks: SSECallbacks
): SSEConnection {
  const url = `${baseUrl(opts)}/strategies/instances/${opts.instanceId}/conversations/${conversationId}/events`

  let closed = false
  const controller = new AbortController()

  async function run() {
    let res: Response
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "X-api-key": opts.apiKey, Accept: "text/event-stream" },
        signal: controller.signal,
        cache: "no-store",
      })
    } catch {
      if (!closed) {
        closed = true
        callbacks.onError({ status: 0, message: "Connection lost" })
      }
      return
    }

    if (!res.ok) {
      closed = true
      callbacks.onError(await errorFromResponse(res))
      return
    }
    if (!res.body) {
      closed = true
      callbacks.onError({ status: 0, message: "No response body" })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let eventType = "message"
    let dataLines: string[] = []

    function dispatch() {
      if (dataLines.length === 0) {
        eventType = "message"
        return
      }
      const data = dataLines.join("\n")
      const type = eventType
      eventType = "message"
      dataLines = []
      if (type === "finish") {
        closed = true
        callbacks.onFinish()
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (parsed.text || parsed.richContent) {
          callbacks.onMessage({
            text: parsed.text ?? "",
            richContent: parsed.richContent,
          })
        }
      } catch {
        // ignore parse errors
      }
    }

    try {
      while (!closed) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIdx: number
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, newlineIdx)
          buffer = buffer.slice(newlineIdx + 1)
          const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw

          if (line === "") {
            dispatch()
            continue
          }
          if (line.startsWith(":")) continue
          const colon = line.indexOf(":")
          const field = colon === -1 ? line : line.slice(0, colon)
          let val = colon === -1 ? "" : line.slice(colon + 1)
          if (val.startsWith(" ")) val = val.slice(1)

          if (field === "event") eventType = val
          else if (field === "data") dataLines.push(val)
        }
      }
    } catch {
      // Network/stream error — treat as terminal.
    }

    if (!closed) {
      closed = true
      callbacks.onError({ status: 0, message: "Connection lost" })
    }
  }

  void run()

  return {
    close() {
      closed = true
      controller.abort()
    },
  }
}
