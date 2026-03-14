import { useState, useRef, useEffect, useCallback } from "react"
import type { UseStratipyReturn, ChatHelpers } from "./types"

const SCROLL_THRESHOLD = 40

export function useChatHelpers(chat: UseStratipyReturn): ChatHelpers {
  const [input, setInput] = useState("")
  const [isScrolledUp, setIsScrolledUp] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [])

  // Auto-scroll when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom()
    }
  }, [chat.messages, isScrolledUp, scrollToBottom])

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD
      setIsScrolledUp(!atBottom)
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
    }
  }, [])

  const submitInput = useCallback(() => {
    const text = input.trim()
    if (!text || chat.streaming) return
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    chat.send(text)
  }, [input, chat.streaming, chat.send])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
      // defer resize to after state update
      requestAnimationFrame(resizeTextarea)
    },
    [resizeTextarea]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        submitInput()
      }
    },
    [submitInput]
  )

  // Expose a callback ref so we can capture the textarea element
  const inputProps = {
    value: input,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    disabled: chat.streaming,
    "aria-label": "Message input" as const,
    ref: textareaRef,
  }

  return {
    scrollRef,
    isScrolledUp,
    scrollToBottom,
    input,
    setInput,
    inputProps,
    submitInput,
  }
}
