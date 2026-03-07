export interface UseStratipyOptions {
  /** Strategy instance ID */
  instanceId: string
  /** Publishable key (pk_...) */
  apiKey: string
  /** Conversation-scoped config props */
  config?: Record<string, string>
  /** API base URL (defaults to https://api.stratipy.com) */
  apiUrl?: string
}

export interface Message {
  /** Local ID: "msg_0", "msg_1", etc. */
  id: string
  role: "user" | "ai"
  text: string
}

export interface Attachment {
  name: string
  url: string
  size: number
  contentType: string
}

export interface StratipyError {
  status: number
  message: string
  /** e.g. "insufficient_credits" for 402 */
  code?: string
}

export interface UseStratipyReturn {
  messages: Message[]
  send: (text: string, attachments?: Attachment[]) => Promise<void>
  streaming: boolean
  error: StratipyError | null
  conversationId: string | null
  reset: () => void
  cancel: () => Promise<void>
}
