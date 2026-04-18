import type { Attachment, Message, StratipyError } from "./types"
import type { SendHandle } from "./core"
import { createConversation, sendMessage, cancelConversation } from "./core"

export interface ChatSessionOptions {
  instanceId: string
  apiKey: string
  config?: Record<string, string>
  apiUrl?: string
}

export type ChatSessionListener = (state: ChatSessionState) => void

export interface ChatSessionState {
  messages: Message[]
  streaming: boolean
  error: StratipyError | null
  conversationId: string | null
}

export class ChatSession {
  private messages: Message[] = []
  private streaming = false
  private error: StratipyError | null = null
  private conversationId: string | null = null
  private activeSend: SendHandle | null = null
  private sending = false
  private listeners = new Set<ChatSessionListener>()

  constructor(private options: ChatSessionOptions) {}

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: ChatSessionListener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  /** Get current state snapshot */
  getState(): ChatSessionState {
    return {
      messages: this.messages,
      streaming: this.streaming,
      error: this.error,
      conversationId: this.conversationId,
    }
  }

  /** Send a message. Creates conversation lazily on first call. */
  async send(text: string, attachments?: Attachment[]): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || this.streaming || this.sending) return

    this.sending = true
    this.error = null
    this.notify()

    const opts = this.coreOpts()

    try {
      if (!this.conversationId) {
        const result = await createConversation(opts, this.options.config)
        this.conversationId = result.conversationId
      }

      const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: trimmed }
      const placeholder: Message = { id: crypto.randomUUID(), role: "ai", text: "" }
      this.messages = [...this.messages, userMsg, placeholder]
      this.streaming = true
      this.sending = false
      this.notify()

      this.activeSend = sendMessage(opts, this.conversationId, trimmed, {
        onMessage: (incoming) => {
          const msgs = [...this.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === "ai" && !last.text) {
            msgs[msgs.length - 1] = { ...last, text: incoming }
          } else {
            msgs.push({ id: crypto.randomUUID(), role: "ai", text: incoming })
          }
          this.messages = msgs
          this.notify()
        },
        onFinish: () => {
          this.activeSend = null
          this.streaming = false
          this.notify()
        },
        onError: (err) => {
          this.activeSend = null
          this.streaming = false
          this.error = err
          this.notify()
        },
      }, attachments)
    } catch (err) {
      this.sending = false
      this.streaming = false
      this.error = toStratipyError(err)
      this.notify()
    }
  }

  /** Reset: cancel any in-flight send, server-side cancel, clear all state, start fresh */
  reset(): void {
    this.activeSend?.cancel()
    this.activeSend = null

    if (this.conversationId) {
      cancelConversation(this.coreOpts(), this.conversationId)
    }

    this.messages = []
    this.streaming = false
    this.error = null
    this.conversationId = null
    this.sending = false
    this.notify()
  }

  /** Cancel the current assistant turn (aborts the in-flight stream). */
  async cancel(): Promise<void> {
    this.activeSend?.cancel()
    this.activeSend = null
    this.streaming = false
    this.sending = false

    if (this.conversationId) {
      await cancelConversation(this.coreOpts(), this.conversationId)
    }

    this.notify()
  }

  /** Clean up resources. Call when done (e.g. page unload). */
  destroy(): void {
    this.activeSend?.cancel()
    this.activeSend = null

    if (this.conversationId) {
      cancelConversation(this.coreOpts(), this.conversationId)
    }

    this.listeners.clear()
  }

  private coreOpts() {
    return {
      instanceId: this.options.instanceId,
      apiKey: this.options.apiKey,
      apiUrl: this.options.apiUrl,
    }
  }

  private notify(): void {
    const state = this.getState()
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}

function toStratipyError(err: unknown): StratipyError {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  ) {
    return err as StratipyError
  }
  return {
    status: 0,
    message: err instanceof Error ? err.message : "Unknown error",
  }
}
