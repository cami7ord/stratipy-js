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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText
    let code: string | undefined
    try {
      const body = await res.json()
      message = body.message ?? body.error ?? message
    } catch {
      // use statusText
    }
    if (res.status === 402) code = "insufficient_credits"
    const err: StratipyError = { status: res.status, message, code }
    throw err
  }
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

export interface SSECallbacks {
  onMessage: (text: string) => void
  onFinish: () => void
  onError: (error: StratipyError) => void
}

export interface SSEConnection {
  close(): void
}

const MAX_RETRIES = 3

export function connectSSE(
  opts: CoreOptions,
  conversationId: string,
  callbacks: SSECallbacks
): SSEConnection {
  const url = `${baseUrl(opts)}/strategies/instances/${opts.instanceId}/conversations/${conversationId}/events?key=${opts.apiKey}`

  let retries = 0
  let es: EventSource | null = null
  let closed = false
  let retryTimeout: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (closed) return

    es = new EventSource(url)

    es.onopen = () => {
      retries = 0
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.text) {
          callbacks.onMessage(data.text)
        }
      } catch {
        // ignore parse errors
      }
    }

    es.addEventListener("finish", () => {
      es?.close()
      closed = true
      callbacks.onFinish()
    })

    es.onerror = () => {
      es?.close()
      if (closed) return

      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 10000)
        retries++
        retryTimeout = setTimeout(connect, delay)
      } else {
        closed = true
        callbacks.onError({ status: 0, message: "Connection lost" })
      }
    }
  }

  connect()

  return {
    close() {
      closed = true
      if (retryTimeout) clearTimeout(retryTimeout)
      es?.close()
    },
  }
}
