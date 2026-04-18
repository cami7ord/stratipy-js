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

export interface Button {
  id: string
  title: string
}

export interface ListRow {
  id: string
  title: string
  description?: string
}

export interface ListSection {
  title: string
  rows: ListRow[]
}

export type RichContent =
  | { type: "buttons"; body: string; buttons: Button[] }
  | { type: "list"; body: string; buttonText: string; sections: ListSection[] }

export interface Message {
  /** Local ID: "msg_0", "msg_1", etc. */
  id: string
  role: "user" | "ai"
  text: string
  richContent?: RichContent
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

export interface ChatInputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  disabled: boolean
  "aria-label": string
}

export interface ChatHelpers {
  /** Ref to attach to the scrollable messages container */
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Whether the user has scrolled up from the bottom */
  isScrolledUp: boolean
  /** Scroll to the bottom of the messages container */
  scrollToBottom: () => void
  /** Current input value */
  input: string
  /** Set the input value */
  setInput: (value: string) => void
  /** Props to spread onto a <textarea> */
  inputProps: ChatInputProps
  /** Submit the current input */
  submitInput: () => void
}

export interface StratipyChatRenderProps extends UseStratipyReturn, ChatHelpers {}

export interface StratipyChatProps extends UseStratipyOptions {
  /** Render prop — receives all conversation state + helpers */
  children: (props: StratipyChatRenderProps) => React.ReactNode
}

export interface StratipyChatDefaultProps extends UseStratipyOptions {
  /** Custom class name for the root container */
  className?: string
  /** Placeholder text for the input */
  placeholder?: string
  /** Title shown in the panel header */
  title?: string
  /** Position of the floating button */
  position?: "bottom-right" | "bottom-left"
  /** Whether the panel starts open */
  defaultOpen?: boolean
}
