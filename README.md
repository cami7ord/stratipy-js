# @stratipy/react

Add an AI chat to your app. Works with React, Vue, Svelte, or vanilla JS.

## Install

```bash
npm install @stratipy/react
```

## The Fastest Way (React)

Drop a floating chat widget into your app with one line:

```tsx
import { StratipyChat } from "@stratipy/react"

function App() {
  return (
    <>
      <YourExistingApp />
      <StratipyChat.Default
        instanceId="your-instance-id"
        apiKey="pk_your_publishable_key"
      />
    </>
  )
}
```

That's it. You get a floating chat button in the bottom-right corner that opens a chat panel. No CSS, no state management, no boilerplate.

### Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `instanceId` | `string` | — | Strategy instance ID from your dashboard |
| `apiKey` | `string` | — | Publishable key (`pk_...`) |
| `title` | `string` | `"Chat"` | Panel header text |
| `placeholder` | `string` | `"Type a message..."` | Input placeholder |
| `position` | `"bottom-right" \| "bottom-left"` | `"bottom-right"` | Where the button appears |
| `defaultOpen` | `boolean` | `false` | Start with the panel open |
| `config` | `Record<string, string>` | — | Config props passed at conversation start |
| `apiUrl` | `string` | `"https://api.stratipy.com"` | API base URL |

## Custom UI (React)

Want full control over the design? Use the headless `<StratipyChat>` component. You get all the chat logic (state, streaming, scroll, keyboard handling) — you bring the markup:

```tsx
import { StratipyChat } from "@stratipy/react"

function App() {
  return (
    <StratipyChat
      instanceId="your-instance-id"
      apiKey="pk_your_publishable_key"
    >
      {({ messages, streaming, inputProps, submitInput, scrollRef, reset }) => (
        <div className="my-chat">
          <button onClick={reset}>New chat</button>

          <div ref={scrollRef} className="my-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={msg.role}>
                {msg.text}
              </div>
            ))}
            {streaming && <div>Thinking...</div>}
          </div>

          <div className="my-input">
            <textarea {...inputProps} placeholder="Message..." />
            <button onClick={submitInput}>Send</button>
          </div>
        </div>
      )}
    </StratipyChat>
  )
}
```

### What you get for free

The headless component handles all the boring stuff so you don't have to:

- **Auto-scroll** to new messages (pauses when you scroll up, shows a "scroll to bottom" indicator via `isScrolledUp`)
- **Enter to send**, Shift+Enter for newline
- **Auto-resize** textarea as you type
- **Server-side cancel** when you reset or leave the page (saves credits)
- **Lazy conversation creation** — no API calls until the first message

### Render prop API

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `Message[]` | All messages in the conversation |
| `send` | `(text, attachments?) => Promise<void>` | Send a message |
| `streaming` | `boolean` | `true` while the AI is responding |
| `error` | `StratipyError \| null` | Last error, or `null` |
| `conversationId` | `string \| null` | Current conversation ID |
| `reset` | `() => void` | Clear chat and start over |
| `cancel` | `() => Promise<void>` | Stop the AI mid-response |
| `scrollRef` | `RefObject<HTMLDivElement>` | Attach to your scrollable messages container |
| `isScrolledUp` | `boolean` | `true` when the user has scrolled up |
| `scrollToBottom` | `() => void` | Scroll back to the latest message |
| `input` | `string` | Current input value |
| `setInput` | `(value) => void` | Set the input value |
| `inputProps` | `object` | Spread onto a `<textarea>` for auto-resize + keyboard handling |
| `submitInput` | `() => void` | Submit the current input |

## Hook (React)

If you don't need the built-in helpers and want to manage everything yourself:

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

## Vue, Svelte, Vanilla JS

Use `ChatSession` from the core module. It manages all the conversation state, SSE streaming, and cleanup — you just subscribe to changes and update your UI:

```js
import { ChatSession } from "@stratipy/react/core"

const chat = new ChatSession({
  instanceId: "your-instance-id",
  apiKey: "pk_your_publishable_key",
})

// Subscribe to state changes
chat.subscribe(({ messages, streaming, error }) => {
  // Update your UI here — works with any framework
  console.log(messages, streaming, error)
})

// Send a message (creates conversation automatically on first call)
await chat.send("Hello!")

// Start over (cancels server-side too, saves credits)
chat.reset()

// Clean up when the page unloads
window.addEventListener("beforeunload", () => chat.destroy())
```

### Vue example

```vue
<script setup>
import { ref, onMounted, onUnmounted } from "vue"
import { ChatSession } from "@stratipy/react/core"

const messages = ref([])
const streaming = ref(false)
const error = ref(null)
const input = ref("")

const chat = new ChatSession({
  instanceId: "your-instance-id",
  apiKey: "pk_your_publishable_key",
})

onMounted(() => {
  chat.subscribe((state) => {
    messages.value = state.messages
    streaming.value = state.streaming
    error.value = state.error
  })
})

onUnmounted(() => chat.destroy())

async function sendMessage() {
  const text = input.value.trim()
  if (!text) return
  input.value = ""
  await chat.send(text)
}
</script>

<template>
  <div>
    <div v-for="msg in messages" :key="msg.id">
      <strong>{{ msg.role === "user" ? "You" : "AI" }}:</strong> {{ msg.text }}
    </div>
    <div v-if="streaming">Thinking...</div>
    <div v-if="error" style="color: red">{{ error.message }}</div>
    <input v-model="input" @keydown.enter="sendMessage" :disabled="streaming" />
    <button @click="sendMessage" :disabled="streaming">Send</button>
  </div>
</template>
```

### Svelte example

```svelte
<script>
  import { ChatSession } from "@stratipy/react/core"
  import { onDestroy } from "svelte"

  let messages = $state([])
  let streaming = $state(false)
  let error = $state(null)
  let input = $state("")

  const chat = new ChatSession({
    instanceId: "your-instance-id",
    apiKey: "pk_your_publishable_key",
  })

  chat.subscribe((state) => {
    messages = state.messages
    streaming = state.streaming
    error = state.error
  })

  onDestroy(() => chat.destroy())

  async function sendMessage() {
    const text = input.trim()
    if (!text) return
    input = ""
    await chat.send(text)
  }
</script>

{#each messages as msg (msg.id)}
  <div>
    <strong>{msg.role === "user" ? "You" : "AI"}:</strong> {msg.text}
  </div>
{/each}
{#if streaming}<div>Thinking...</div>{/if}
{#if error}<div style="color: red">{error.message}</div>{/if}
<input bind:value={input} onkeydown={(e) => e.key === "Enter" && sendMessage()} disabled={streaming} />
<button onclick={sendMessage} disabled={streaming}>Send</button>
```

### ChatSession API

| Method | Description |
|--------|-------------|
| `subscribe(listener)` | Listen to state changes. Returns an unsubscribe function. |
| `getState()` | Get current state snapshot (`messages`, `streaming`, `error`, `conversationId`). |
| `send(text, attachments?)` | Send a message. Creates conversation on first call. |
| `reset()` | Cancel server-side, clear all state, start fresh. |
| `cancel()` | Stop the current AI response. |
| `destroy()` | Clean up all resources. Call on page unload or component teardown. |

### Low-level functions

If you need even more control, the individual functions are also available:

```js
import {
  createConversation,
  sendMessage,
  cancelConversation,
  connectSSE,
} from "@stratipy/react/core"
```

## Common Patterns

### With conversation config

Some strategies accept configuration at conversation start:

```tsx
<StratipyChat.Default
  instanceId="your-instance-id"
  apiKey="pk_your_publishable_key"
  config={{
    dataset_url: "https://example.com/data.csv",
    analysis_type: "summary",
  }}
/>
```

### Error handling

```tsx
<StratipyChat instanceId="..." apiKey="pk_...">
  {({ messages, error, ...rest }) => (
    <div>
      {error?.code === "insufficient_credits" && (
        <div>You've run out of credits. <a href="/billing">Top up</a></div>
      )}
      {error && error.code !== "insufficient_credits" && (
        <div>{error.message}</div>
      )}
      {/* rest of your chat UI */}
    </div>
  )}
</StratipyChat>
```

### Local development

Point to your local API server:

```tsx
<StratipyChat.Default
  instanceId="your-instance-id"
  apiKey="pk_your_publishable_key"
  apiUrl="http://localhost:8080"
/>
```

## Types

```typescript
interface Message {
  id: string
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
  code?: string  // "insufficient_credits" for 402
}
```

## Getting Your Keys

1. Go to [stratipy.com](https://stratipy.com) and create an account
2. Create a strategy instance from the dashboard
3. Copy the **Instance ID** and your **Publishable Key** (`pk_...`)

The publishable key is safe to use in browser code. It only works from the domain you registered.

## License

MIT
