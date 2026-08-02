import { describe, expect, it, vi } from "vitest";

const workerScope = { postMessage: vi.fn(), onmessage: undefined as ((event: MessageEvent) => Promise<void>) | undefined };
vi.stubGlobal("self", workerScope);
await import("./solver.worker");

describe("solver worker", () => {
  it("registers its message handler before loading the solver", async () => {
    expect(workerScope.onmessage).toBeTypeOf("function");
    await workerScope.onmessage?.({ data: { id: 1, request: { kind: "solve", config: {} } } } as MessageEvent);
    expect(workerScope.postMessage).toHaveBeenCalledWith({ id: 1, error: expect.stringContaining("Wavelength") });
  });
});
