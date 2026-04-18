import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useStratipy } from "../src/use-stratipy"
import * as core from "../src/core"

vi.mock("../src/core", () => ({
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  cancelConversation: vi.fn(),
}))

const defaultOptions = {
  instanceId: "inst_123",
  apiKey: "pk_abc",
}

beforeEach(() => {
  vi.restoreAllMocks()
})

/**
 * Mocks `sendMessage` so tests can drive streaming callbacks manually.
 * Returns a ref whose `.current` holds the latest captured callbacks.
 */
function installSendMessageMock() {
  const ref: { current: core.SendCallbacks | null; handle: core.SendHandle } = {
    current: null,
    handle: { cancel: vi.fn() },
  }
  vi.mocked(core.sendMessage).mockImplementation((_opts, _cid, _text, callbacks) => {
    ref.current = callbacks
    return ref.handle
  })
  return ref
}

describe("useStratipy", () => {
  it("returns correct initial state", () => {
    const { result } = renderHook(() => useStratipy(defaultOptions))

    expect(result.current.messages).toEqual([])
    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.conversationId).toBeNull()
  })

  it("creates conversation, sends message, and streams response on first send", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    const send = installSendMessageMock()

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

    // Streaming send kicked off
    expect(core.sendMessage).toHaveBeenCalledWith(
      { instanceId: "inst_123", apiKey: "pk_abc", apiUrl: undefined },
      "conv_1",
      "hello",
      expect.any(Object),
      undefined
    )

    // User message + empty AI message
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({ role: "user", text: "hello" })
    expect(result.current.messages[1]).toMatchObject({ role: "ai", text: "" })
    expect(result.current.streaming).toBe(true)

    // First streamed chunk fills the empty placeholder
    act(() => { send.current!.onMessage("Hi there!") })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].text).toBe("Hi there!")

    // A second chunk in the same turn creates a new bubble
    act(() => { send.current!.onMessage("Anything else?") })
    expect(result.current.messages).toHaveLength(3)
    expect(result.current.messages[2]).toMatchObject({ role: "ai", text: "Anything else?" })

    act(() => { send.current!.onFinish() })
    expect(result.current.streaming).toBe(false)
  })

  it("reuses existing conversationId on second send", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    const send = installSendMessageMock()

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })
    act(() => { send.current!.onFinish() })

    await act(async () => { await result.current.send("follow up") })

    expect(core.createConversation).toHaveBeenCalledTimes(1)
    expect(result.current.messages).toHaveLength(4)
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

  it("cancel aborts the in-flight send and calls cancelConversation", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    vi.mocked(core.cancelConversation).mockResolvedValue(undefined)
    const send = installSendMessageMock()

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })

    await act(async () => { await result.current.cancel() })

    expect(send.handle.cancel).toHaveBeenCalled()
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
    const send = installSendMessageMock()

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })
    act(() => { send.current!.onFinish() })

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
    const send = installSendMessageMock()

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })
    act(() => { send.current!.onFinish() })

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
    installSendMessageMock()

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })
    expect(result.current.streaming).toBe(true)

    await act(async () => { await result.current.send("ignored") })

    expect(core.sendMessage).toHaveBeenCalledTimes(1)
  })

  it("send is no-op for empty text", async () => {
    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("   ") })

    expect(core.createConversation).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
  })

  it("passes config to createConversation", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    installSendMessageMock()

    const { result } = renderHook(() =>
      useStratipy({ ...defaultOptions, config: { topic: "sales" } })
    )

    await act(async () => { await result.current.send("hello") })

    expect(core.createConversation).toHaveBeenCalledWith(
      expect.any(Object),
      { topic: "sales" }
    )
  })

  it("surfaces streaming error callback", async () => {
    vi.mocked(core.createConversation).mockResolvedValue({
      conversationId: "conv_1",
      instanceId: "inst_123",
      strategyId: "chat",
    })
    const send = installSendMessageMock()

    const { result } = renderHook(() => useStratipy(defaultOptions))

    await act(async () => { await result.current.send("hello") })

    act(() => {
      send.current!.onError({ status: 0, message: "Connection lost" })
    })

    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toMatchObject({ message: "Connection lost" })
  })
})
