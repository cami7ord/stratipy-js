import { useState, useRef, useEffect, useCallback } from "react"
import type { UseStratipyOptions, UseStratipyReturn, Message, Attachment, StratipyError } from "./types"
import type { SSEConnection } from "./core"
import { createConversation, sendMessage, cancelConversation, connectSSE } from "./core"

export function useStratipy(options: UseStratipyOptions): UseStratipyReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<StratipyError | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const eventSourceRef = useRef<SSEConnection | null>(null)
  const optionsRef = useRef(options)
  const genId = () => crypto.randomUUID()
  const sendingRef = useRef(false)

  optionsRef.current = options

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  const send = useCallback(async (text: string, attachments?: Attachment[]) => {
    const trimmed = text.trim()
    if (!trimmed || streaming || sendingRef.current) return

    sendingRef.current = true
    setError(null)

    const opts = optionsRef.current
    const coreOpts = {
      instanceId: opts.instanceId,
      apiKey: opts.apiKey,
      apiUrl: opts.apiUrl,
    }

    try {
      // Lazy conversation creation
      let convId = conversationId
      if (!convId) {
        const result = await createConversation(coreOpts, opts.config)
        convId = result.conversationId
        setConversationId(convId)
      }

      // Append user message
      const userMsgId = genId()
      setMessages((prev) => [...prev, { id: userMsgId, role: "user", text: trimmed }])

      // Send to API
      await sendMessage(coreOpts, convId, trimmed, attachments)

      // Append empty AI message and start streaming
      const aiMsgId = genId()
      setMessages((prev) => [...prev, { id: aiMsgId, role: "ai", text: "" }])
      setStreaming(true)
      sendingRef.current = false

      // Connect SSE if not already connected (keep alive for multi-turn conversations)
      if (!eventSourceRef.current) {
        eventSourceRef.current = connectSSE(coreOpts, convId, {
          onMessage: (chunk) => {
            // Each SSE message means the AI has produced output — re-enable input
            setStreaming(false)
            setMessages((prev) => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last?.role === "ai") {
                updated[updated.length - 1] = { ...last, text: last.text + chunk }
              }
              return updated
            })
          },
          onFinish: () => {
            eventSourceRef.current = null
            setStreaming(false)
            sendingRef.current = false
          },
          onError: (err) => {
            eventSourceRef.current = null
            setStreaming(false)
            sendingRef.current = false
            setError(err)
          },
        })
      }
    } catch (err) {
      sendingRef.current = false
      setStreaming(false)
      if (isStratipyError(err)) {
        setError(err)
      } else {
        setError({
          status: 0,
          message: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }
  }, [conversationId, streaming])

  const reset = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setMessages([])
    setStreaming(false)
    setError(null)
    setConversationId(null)
    sendingRef.current = false
  }, [])

  const cancel = useCallback(async () => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setStreaming(false)
    sendingRef.current = false

    if (conversationId) {
      const opts = optionsRef.current
      await cancelConversation(
        { instanceId: opts.instanceId, apiKey: opts.apiKey, apiUrl: opts.apiUrl },
        conversationId
      )
    }
  }, [conversationId])

  return { messages, send, streaming, error, conversationId, reset, cancel }
}

function isStratipyError(err: unknown): err is StratipyError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  )
}
