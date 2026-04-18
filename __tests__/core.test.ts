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

function sseResponse(body: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } })
}

async function flush() {
  // Drain microtasks so the streaming loop advances.
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe("connectSSE", () => {
  it("fetches events URL with X-api-key header (no ?key= in URL)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse(""))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("https://api.test.com/strategies/instances/inst_123/conversations/conv_1/events")
    expect((init as RequestInit).method).toBe("GET")
    expect((init as RequestInit).headers).toMatchObject({ "X-api-key": "pk_abc" })
  })

  it("calls onMessage with text chunks from SSE frames", async () => {
    const frame = `data: ${JSON.stringify({ text: "Hello", conversationId: "conv_1" })}\n\n`
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse(frame))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onMessage).toHaveBeenCalledWith({ text: "Hello", richContent: undefined })
  })

  it("reassembles frames split across chunks", async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"text":"Hel`))
        controller.enqueue(encoder.encode(`lo","conversationId":"conv_1"}\n\n`))
        controller.close()
      },
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200 })
    )

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onMessage).toHaveBeenCalledWith({ text: "Hello", richContent: undefined })
  })

  it("calls onFinish on finish event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse(`event: finish\ndata: {}\n\n`))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onFinish).toHaveBeenCalledTimes(1)
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it("surfaces 4xx as terminal error without retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid key" }), { status: 401 })
    )

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onError).toHaveBeenCalledWith({ status: 401, message: "Invalid key", code: undefined })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("calls onError on network failure without retrying", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onError).toHaveBeenCalledWith({ status: 0, message: "Connection lost" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("surfaces mid-stream drops as terminal error (no retry)", async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"text":"Hi","conversationId":"conv_1"}\n\n`))
        controller.close() // stream ends without `event: finish`
      },
    })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200 })
    )

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onMessage).toHaveBeenCalledWith({ text: "Hi", richContent: undefined })
    expect(callbacks.onError).toHaveBeenCalledWith({ status: 0, message: "Connection lost" })
    expect(callbacks.onFinish).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("ignores messages without text field", async () => {
    const frame = `data: ${JSON.stringify({ conversationId: "conv_1" })}\n\n`
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse(frame))

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    connectSSE(opts, "conv_1", callbacks)
    await flush()

    expect(callbacks.onMessage).not.toHaveBeenCalled()
  })

  it("close() aborts the in-flight request", async () => {
    let aborted = false
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        ;(init as RequestInit).signal?.addEventListener("abort", () => {
          aborted = true
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    })

    const callbacks = { onMessage: vi.fn(), onFinish: vi.fn(), onError: vi.fn() }
    const conn = connectSSE(opts, "conv_1", callbacks)
    conn.close()
    await flush()

    expect(aborted).toBe(true)
    expect(callbacks.onError).not.toHaveBeenCalled()
  })
})
