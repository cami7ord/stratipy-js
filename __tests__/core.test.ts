import { describe, it, expect, vi, beforeEach } from "vitest"
import { createConversation, sendMessage, cancelConversation, connectSSE } from "../src/core"
import type { StratipyError } from "../src/types"

const opts = {
  instanceId: "inst_123",
  apiKey: "pk_abc",
  apiUrl: "https://api.test.com",
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("createConversation", () => {
  it("sends correct request and returns response", async () => {
    const mockResponse = { conversationId: "conv_1", instanceId: "inst_123", strategyId: "chat" }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 201 })
    )

    const result = await createConversation(opts, { topic: "test" })

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test.com/strategies/instances/inst_123/conversations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-api-key": "pk_abc" },
        body: JSON.stringify({ config: { topic: "test" } }),
      }
    )
    expect(result).toEqual(mockResponse)
  })

  it("sends empty config when none provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conversationId: "conv_1", instanceId: "inst_123", strategyId: "chat" }), { status: 201 })
    )

    await createConversation(opts)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ config: {} }),
      })
    )
  })

  it("uses default API URL when none specified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conversationId: "c", instanceId: "i", strategyId: "s" }), { status: 201 })
    )

    await createConversation({ instanceId: "inst_1", apiKey: "pk_x" })

    expect(fetch).toHaveBeenCalledWith(
      "https://api.stratipy.com/strategies/instances/inst_1/conversations",
      expect.any(Object)
    )
  })

  it("throws StratipyError on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Instance not active" }), { status: 400 })
    )

    try {
      await createConversation(opts)
      expect.fail("should have thrown")
    } catch (err) {
      const e = err as StratipyError
      expect(e.status).toBe(400)
      expect(e.message).toBe("Instance not active")
      expect(e.code).toBeUndefined()
    }
  })

  it("sets code to insufficient_credits on 402", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Not enough credits" }), { status: 402 })
    )

    try {
      await createConversation(opts)
      expect.fail("should have thrown")
    } catch (err) {
      const e = err as StratipyError
      expect(e.status).toBe(402)
      expect(e.code).toBe("insufficient_credits")
    }
  })
})

describe("sendMessage", () => {
  it("sends correct request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }))

    await sendMessage(opts, "conv_1", "hello", [
      { name: "file.csv", url: "https://s3/file.csv", size: 1024, contentType: "text/csv" },
    ])

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test.com/strategies/instances/inst_123/conversations/conv_1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-api-key": "pk_abc" },
        body: JSON.stringify({
          text: "hello",
          attachments: [{ name: "file.csv", url: "https://s3/file.csv", size: 1024, contentType: "text/csv" }],
        }),
      }
    )
  })

  it("sends empty attachments by default", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }))

    await sendMessage(opts, "conv_1", "hello")

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ text: "hello", attachments: [] }),
      })
    )
  })

  it("throws on error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 })
    )

    await expect(sendMessage(opts, "conv_1", "hello")).rejects.toMatchObject({
      status: 404,
      message: "Not found",
    })
  })
})

describe("cancelConversation", () => {
  it("sends POST to cancel endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }))

    await cancelConversation(opts, "conv_1")

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test.com/strategies/instances/inst_123/conversations/conv_1/cancel",
      {
        method: "POST",
        headers: { "X-api-key": "pk_abc" },
      }
    )
  })

  it("swallows fetch errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"))

    // Should not throw
    await cancelConversation(opts, "conv_1")
  })
})

describe("connectSSE", () => {
  it("creates EventSource with correct URL including key param", () => {
    const mockES = { onmessage: null, onerror: null, addEventListener: vi.fn(), close: vi.fn() }
    vi.stubGlobal("EventSource", vi.fn(() => mockES))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)

    expect(EventSource).toHaveBeenCalledWith(
      "https://api.test.com/strategies/instances/inst_123/conversations/conv_1/events?key=pk_abc"
    )
  })

  it("calls onMessage with text chunks", () => {
    const mockES = { onmessage: null as any, onerror: null, addEventListener: vi.fn(), close: vi.fn() }
    vi.stubGlobal("EventSource", vi.fn(() => mockES))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)

    // Simulate SSE message
    mockES.onmessage({ data: JSON.stringify({ text: "Hello", conversationId: "conv_1" }) })

    expect(callbacks.onMessage).toHaveBeenCalledWith("Hello")
  })

  it("calls onFinish on finish event", () => {
    const listeners: Record<string, Function> = {}
    const mockES = {
      onmessage: null,
      onerror: null,
      addEventListener: vi.fn((event: string, handler: Function) => { listeners[event] = handler }),
      close: vi.fn(),
    }
    vi.stubGlobal("EventSource", vi.fn(() => mockES))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)

    listeners["finish"]()

    expect(mockES.close).toHaveBeenCalled()
    expect(callbacks.onFinish).toHaveBeenCalled()
  })

  it("calls onError after exhausting retries", () => {
    vi.useFakeTimers()
    const mockES = { onopen: null as any, onmessage: null, onerror: null as any, addEventListener: vi.fn(), close: vi.fn() }
    vi.stubGlobal("EventSource", vi.fn(() => mockES))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)

    // Trigger 3 retries (with backoff timers) + 1 final error
    for (let i = 0; i < 3; i++) {
      mockES.onerror()
      expect(callbacks.onError).not.toHaveBeenCalled()
      vi.advanceTimersByTime(10_000)
    }
    mockES.onerror()

    expect(callbacks.onError).toHaveBeenCalledWith({ status: 0, message: "Connection lost" })
    vi.useRealTimers()
  })

  it("ignores messages without text field", () => {
    const mockES = { onmessage: null as any, onerror: null, addEventListener: vi.fn(), close: vi.fn() }
    vi.stubGlobal("EventSource", vi.fn(() => mockES))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)

    mockES.onmessage({ data: JSON.stringify({ conversationId: "conv_1" }) })

    expect(callbacks.onMessage).not.toHaveBeenCalled()
  })
})
