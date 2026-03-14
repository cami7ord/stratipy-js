import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import type { UseStratipyOptions, UseStratipyReturn, Attachment } from "./types"
import { ChatSession } from "./chat-session"

export function useStratipy(options: UseStratipyOptions): UseStratipyReturn {
  const session = useMemo(
    () => new ChatSession(options),
    [options.instanceId, options.apiKey, options.apiUrl]
  )

  const [state, setState] = useState(() => session.getState())
  const configRef = useRef(options.config)
  configRef.current = options.config

  useEffect(() => {
    const unsub = session.subscribe(setState)
    return () => {
      unsub()
      session.destroy()
    }
  }, [session])

  const send = useCallback(
    (text: string, attachments?: Attachment[]) => session.send(text, attachments),
    [session]
  )

  const reset = useCallback(() => session.reset(), [session])
  const cancel = useCallback(() => session.cancel(), [session])

  return {
    messages: state.messages,
    send,
    streaming: state.streaming,
    error: state.error,
    conversationId: state.conversationId,
    reset,
    cancel,
  }
}
