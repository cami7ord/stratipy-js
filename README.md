# @stratipy/react

Add an AI agent to your React app in 60 seconds.

## Install

```bash
npm install @stratipy/react
```

## Quick Start

```tsx
import { useStratipy } from "@stratipy/react"

function Chat() {
  const { messages, send, streaming } = useStratipy({
    instanceId: "your-instance-id",
    apiKey: "pk_your_publishable_key",
  })

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role === "user" ? "You" : "AI"}:</strong> {msg.text}
        </div>
      ))}

      <form onSubmit={(e) => {
        e.preventDefault()
        const input = e.currentTarget.elements.namedItem("msg") as HTMLInputElement
        send(input.value)
        input.value = ""
      }}>
        <input name="msg" placeholder="Type a message..." disabled={streaming} />
        <button type="submit" disabled={streaming}>Send</button>
      </form>
    </div>
  )
}
```

## API Reference

### `useStratipy(options)`

#### Options

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `instanceId` | `string` | Yes | Strategy instance ID from your dashboard |
| `apiKey` | `string` | Yes | Publishable key (`pk_...`) |
| `config` | `Record<string, string>` | No | Conversation-scoped config props |
| `apiUrl` | `string` | No | API base URL (defaults to `https://api.stratipy.com`) |

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `Message[]` | All messages in the conversation |
| `send` | `(text: string, attachments?: Attachment[]) => Promise<void>` | Send a message (creates conversation on first call) |
| `streaming` | `boolean` | `true` while the AI is responding |
| `error` | `StratipyError \| null` | Last error, or `null` |
| `conversationId` | `string \| null` | Current conversation ID, or `null` before first send |
| `reset` | `() => void` | Clear messages and start a new conversation |
| `cancel` | `() => Promise<void>` | Stop the current AI response |

## Types

```typescript
interface Message {
  id: string          // "msg_0", "msg_1", etc.
  role: "user" | "ai"
  text: string
}

interface Attachment {
  name: string
  url: string
  size: number
  contentType: string
}

interface StratipyError {
  status: number
  message: string
  code?: string       // "insufficient_credits" for 402
}
```

## Examples

### Styled Chat (Tailwind)

```tsx
import { useStratipy } from "@stratipy/react"

function Chat() {
  const { messages, send, streaming, error } = useStratipy({
    instanceId: "your-instance-id",
    apiKey: "pk_your_publishable_key",
  })

  return (
    <div className="flex flex-col h-[500px] rounded-xl border bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-900"
            }`}>
              {msg.text || <span className="animate-pulse">...</span>}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-600">{error.message}</div>
      )}

      <form className="flex gap-2 p-4 border-t" onSubmit={(e) => {
        e.preventDefault()
        const input = e.currentTarget.elements.namedItem("msg") as HTMLInputElement
        send(input.value)
        input.value = ""
      }}>
        <input
          name="msg"
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          placeholder="Type a message..."
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
```

### Cancel and Reset

```tsx
function Chat() {
  const { messages, send, streaming, cancel, reset } = useStratipy({
    instanceId: "your-instance-id",
    apiKey: "pk_your_publishable_key",
  })

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {streaming && <button onClick={cancel}>Stop generating</button>}
        <button onClick={reset}>New conversation</button>
      </div>
      {/* messages + input ... */}
    </div>
  )
}
```

### With Config Props

Some strategies accept configuration at conversation start:

```tsx
function DataAnalysis() {
  const { messages, send, streaming } = useStratipy({
    instanceId: "your-instance-id",
    apiKey: "pk_your_publishable_key",
    config: {
      dataset_url: "https://example.com/data.csv",
      analysis_type: "summary",
    },
  })

  return (/* your UI */)
}
```

### Error Handling

```tsx
function Chat() {
  const { messages, send, error } = useStratipy({
    instanceId: "your-instance-id",
    apiKey: "pk_your_publishable_key",
  })

  return (
    <div>
      {error?.code === "insufficient_credits" && (
        <div className="bg-amber-50 p-3 rounded text-amber-800">
          You've run out of credits. <a href="/billing">Top up</a>
        </div>
      )}
      {error && error.code !== "insufficient_credits" && (
        <div className="bg-red-50 p-3 rounded text-red-800">{error.message}</div>
      )}
      {/* messages + input ... */}
    </div>
  )
}
```

## Getting Your Keys

1. Go to [stratipy.com](https://stratipy.com) and create an account
2. Create a strategy instance from the dashboard
3. Copy the **Instance ID** and your **Publishable Key** (`pk_...`)

The publishable key is safe to use in browser code. It only works from the domain you registered.

## License

MIT
