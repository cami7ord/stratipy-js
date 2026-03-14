import React, { useState } from "react"
import { useStratipy } from "./use-stratipy"
import { useChatHelpers } from "./use-chat-helpers"
import type { StratipyChatProps, StratipyChatDefaultProps } from "./types"

export function StratipyChat({ children, ...options }: StratipyChatProps) {
  const chat = useStratipy(options)
  const helpers = useChatHelpers(chat)

  return <>{children({ ...chat, ...helpers })}</>
}

function StratipyChatDefault({
  className,
  placeholder = "Type a message...",
  title = "Chat",
  position = "bottom-right",
  defaultOpen = false,
  ...options
}: StratipyChatDefaultProps) {
  const [open, setOpen] = useState(defaultOpen)
  const isRight = position === "bottom-right"

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            ...s.fab,
            ...(isRight ? { right: 20 } : { left: 20 }),
          }}
          aria-label="Open chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <StratipyChat {...options}>
          {({ messages, streaming, error, reset, scrollRef, isScrolledUp, scrollToBottom, inputProps, submitInput }) => (
            <div
              className={className}
              style={{
                ...s.panel,
                ...(isRight ? { right: 20 } : { left: 20 }),
              }}
            >
              <div style={s.header}>
                <span style={s.title}>{title}</span>
                <div style={s.headerActions}>
                  <button type="button" onClick={reset} style={s.headerBtn} aria-label="New chat">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => setOpen(false)} style={s.headerBtn} aria-label="Close chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <div ref={scrollRef} style={s.messages}>
                {messages.length === 0 && (
                  <div style={s.empty}>Send a message to start</div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={msg.role === "user" ? s.userRow : s.aiRow}
                  >
                    <div style={msg.role === "user" ? s.userBubble : s.aiBubble}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {streaming && <div style={s.typing}>AI is thinking...</div>}
                {error && <div style={s.error}>{error.message}</div>}
              </div>

              {isScrolledUp && (
                <button type="button" onClick={scrollToBottom} style={s.scrollBtn}>
                  ↓
                </button>
              )}

              <div style={s.inputArea}>
                <textarea
                  {...inputProps}
                  placeholder={placeholder}
                  rows={1}
                  style={s.textarea}
                />
                <button
                  type="button"
                  onClick={submitInput}
                  disabled={streaming || !inputProps.value.trim()}
                  style={{
                    ...s.sendBtn,
                    ...(streaming || !inputProps.value.trim() ? { opacity: 0.4, cursor: "not-allowed" } : {}),
                  }}
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </StratipyChat>
      )}
    </>
  )
}

StratipyChat.Default = StratipyChatDefault

// Inline styles — no external CSS needed
const s: Record<string, React.CSSProperties> = {
  fab: {
    position: "fixed",
    bottom: 20,
    zIndex: 9999,
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },
  panel: {
    position: "fixed",
    bottom: 20,
    zIndex: 9999,
    width: 380,
    height: 520,
    maxHeight: "calc(100vh - 40px)",
    maxWidth: "calc(100vw - 40px)",
    borderRadius: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#0f0f0f",
    color: "#e5e5e5",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    border: "1px solid #222",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #222",
    background: "#141414",
  },
  title: {
    fontWeight: 600,
    fontSize: "0.95rem",
  },
  headerActions: {
    display: "flex",
    gap: 4,
  },
  headerBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#555",
    fontSize: "0.85rem",
  },
  userRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  aiRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  userBubble: {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: "12px 12px 4px 12px",
    background: "#2563eb",
    color: "#fff",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  aiBubble: {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: "12px 12px 12px 4px",
    background: "#1a1a1a",
    border: "1px solid #262626",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  typing: {
    color: "#888",
    fontSize: "0.8rem",
    fontStyle: "italic",
  },
  error: {
    color: "#ef4444",
    fontSize: "0.8rem",
    padding: "6px 10px",
    background: "rgba(239,68,68,0.1)",
    borderRadius: 6,
  },
  scrollBtn: {
    position: "absolute",
    bottom: 72,
    left: "50%",
    transform: "translateX(-50%)",
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#e5e5e5",
    cursor: "pointer",
    fontSize: "0.85rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  inputArea: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderTop: "1px solid #222",
    background: "#141414",
  },
  textarea: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#e5e5e5",
    fontSize: "0.85rem",
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    minHeight: 36,
    maxHeight: 120,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    flexShrink: 0,
  },
}
