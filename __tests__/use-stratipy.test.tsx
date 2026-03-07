import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useStratipy } from "../src/use-stratipy"
import * as core from "../src/core"

vi.mock("../src/core", () => ({
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  cancelConversation: vi.fn(),
  connectSSE: vi.fn(),
}))

const defaultOptions = {
  instanceId: "inst_123",
  apiKey: "pk_abc",
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("useStratipy", () => {
  it("returns correct initial state", () => {
    const { result } = renderHook(() => useStratipy(defaultOptions))

    expect(result.current.messages).toEqual([])
    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.conversationId).toBeNull()
  })

  it("creates conversation, sends message, and starts SSE on first send", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)

    let sseCallbacks: core.SSECallbacks | null = null
    const mockES = { close: vi.fn() }
    vi.mocked(core.connectSSE).mockImplementation((_opts, _convId, callbacks) => {
      sseCallbacks = callbacks
      return mockES as unknown as EventSource
    })

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("hello")
    })

    // Conversation created
    expect(core.createConversation).toHaveBeenCalledWith(
      { instanceId: "inst_123", apiKey: "pk_abc", apiUrl: undefined },
      undefined
    )
    expect(result.current.conversationId).toBe("conv_1")

    // Message sent
    expect(core.sendMessage).toHaveBeenCalledWith(
      { instanceId: "inst_123", apiKey: "pk_abc", apiUrl: undefined },
      "conv_1",
      "hello",
      undefined
    )

    // User message + empty AI message
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({ role: "user", text: "hello" })
    expect(result.current.messages[1]).toMatchObject({ role: "ai", text: "" })
    expect(result.current.streaming).toBe(true)

    // Simulate SSE chunks
    act(() => {
      sseCallbacks!.onMessage("Hi ")
    })
    expect(result.current.messages[1].text).toBe("Hi ")

    act(() => {
      sseCallbacks!.onMessage("there!")
    })
    expect(result.current.messages[1].text).toBe("Hi there!")

    // Finish
    act(() => {
      sseCallbacks!.onFinish()
    })
    expect(result.current.streaming).toBe(false)
  })

  it("reuses existing conversationId on second send", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)

    let sseCallbacks: core.SSECallbacks | null = null
    vi.mocked(core.connectSSE).mockImplementation((_opts, _convId, callbacks) => {
      sseCallbacks = callbacks
      return { close: vi.fn() } as unknown as EventSource
    })

    const { result } = renderHook(() => useStratipy(defaultOptions))

    // First send
    await act(async () => {
      await result.current.send("hello")
    })
    act(() => { sseCallbacks!.onFinish() })

    // Second send
    await act(async () => {
      await result.current.send("follow up")
    })

    // createConversation called only once
    expect(core.createConversation).toHaveBeenCalledTimes(1)
    expect(result.current.messages).toHaveLength(4) // user, ai, user, ai
  })

  it("sets error when createConversation fails", async () => {
    vi.mocked(core.createConversation).mockRejectedValue({
      status: 402,
      message: "Insufficient credits",
      code: "insufficient_credits",
    })

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("hello")
    })

    expect(result.current.error).toMatchObject({
      status: 402,
      code: "insufficient_credits",
    })
    expect(result.current.messages).toEqual([])
    expect(result.current.streaming).toBe(false)
  })

  it("cancel closes EventSource and calls cancelConversation", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)
    vi.mocked(core.cancelConversation).mockResolvedValue(undefined)

    const mockES = { close: vi.fn() }
    vi.mocked(core.connectSSE).mockReturnValue(mockES as unknown as EventSource)

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("hello")
    })

    await act(async () => {
      await result.current.cancel()
    })

    expect(mockES.close).toHaveBeenCalled()
    expect(core.cancelConversation).toHaveBeenCalledWith(
      { instanceId: "inst_123", apiKey: "pk_abc", apiUrl: undefined },
      "conv_1"
    )
    expect(result.current.streaming).toBe(false)
  })

  it("reset clears all state", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)

    let sseCallbacks: core.SSECallbacks | null = null
    vi.mocked(core.connectSSE).mockImplementation((_opts, _convId, callbacks) => {
      sseCallbacks = callbacks
      return { close: vi.fn() } as unknown as EventSource
    })

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("hello")
    })
    act(() => { sseCallbacks!.onFinish() })

    act(() => { result.current.reset() })

    expect(result.current.messages).toEqual([])
    expect(result.current.conversationId).toBeNull()
    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("reset then send creates a new conversation", async () => {
    vi.mocked(core.createConversation)
      .mockResolvedValueOnce({ conversationId: "conv_1", instanceId: "inst_123", strategyId: "chat" })
      .mockResolvedValueOnce({ conversationId: "conv_2", instanceId: "inst_123", strategyId: "chat" })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)

    let sseCallbacks: core.SSECallbacks | null = null
    vi.mocked(core.connectSSE).mockImplementation((_opts, _convId, callbacks) => {
      sseCallbacks = callbacks
      return { close: vi.fn() } as unknown as EventSource
    })

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })
    act(() => { sseCallbacks!.onFinish() })

    act(() => { result.current.reset() })

    await act(async () => { await result.current.send("new chat") })

    expect(core.createConversation).toHaveBeenCalledTimes(2)
    expect(result.current.conversationId).toBe("conv_2")
  })

  it("send is no-op while streaming", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)
    vi.mocked(core.connectSSE).mockReturnValue({ close: vi.fn() } as unknown as EventSource)

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("hello")
    })
    expect(result.current.streaming).toBe(true)

    // Second send while streaming — should be ignored
    await act(async () => {
      await result.current.send("ignored")
    })

    expect(core.sendMessage).toHaveBeenCalledTimes(1)
  })

  it("send is no-op for empty text", async () => {
    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("   ")
    })

    expect(core.createConversation).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
  })

  it("passes config to createConversation", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)
    vi.mocked(core.connectSSE).mockReturnValue({ close: vi.fn() } as unknown as EventSource)

    const { result } = renderHook(() =>
      useStratipy({ ...defaultOptions, config: { topic: "sales" } })
    )

    await act(async () => {
      await result.current.send("hello")
    })

    expect(core.createConversation).toHaveBeenCalledWith(
      expect.any(Object),
      { topic: "sales" }
    )
  })

  it("handles SSE error callback", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.sendMessage).mockResolvedValue(undefined)

    let sseCallbacks: core.SSECallbacks | null = null
    vi.mocked(core.connectSSE).mockImplementation((_opts, _convId, callbacks) => {
      sseCallbacks = callbacks
      return { close: vi.fn() } as unknown as EventSource
    })

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => {
      await result.current.send("hello")
    })

    act(() => {
      sseCallbacks!.onError({ status: 0, message: "Connection lost" })
    })

    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toMatchObject({ message: "Connection lost" })
  })
})
