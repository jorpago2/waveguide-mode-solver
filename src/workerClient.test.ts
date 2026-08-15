import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelSolverWorker, runSolverWorker } from "./workerClient";

describe("solver worker client", () => {
  afterEach(() => { cancelSolverWorker(); vi.unstubAllGlobals(); });

  it("rejects instead of remaining busy when the worker cannot start", async () => {
    vi.stubGlobal("Worker", class {
      constructor() { throw new Error("Worker unavailable"); }
    });
    await expect(runSolverWorker({
      kind: "solve",
      config: { wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2, claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 24, modeCount: 1 },
    })).rejects.toThrow("Worker unavailable");
  });

  it("allows bent PML solves to run beyond one minute", async () => {
    const delays: number[] = [];
    let failWorker = () => {};
    vi.stubGlobal("setTimeout", (_callback: () => void, delay: number) => { delays.push(delay); return 1; });
    vi.stubGlobal("clearTimeout", () => {});
    vi.stubGlobal("Worker", class {
      onmessage?: (event: { data: unknown }) => void;
      onerror?: (event: { message: string }) => void;
      onmessageerror?: () => void;
      constructor() { failWorker = () => this.onerror?.({ message: "Stopped after timeout check" }); }
      postMessage() {}
      terminate() {}
    });
    const request = runSolverWorker({
      kind: "solve",
      config: { wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2, claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 64, modeCount: 3, bendRadiusUm: 10 },
    });
    expect(delays).toEqual([900_000]);
    failWorker();
    await expect(request).rejects.toThrow("Stopped after timeout check");
  });

  it("reuses one worker for consecutive requests", async () => {
    let constructions = 0;
    vi.stubGlobal("Worker", class {
      onmessage?: (event: { data: unknown }) => void;
      onerror?: (event: { message: string }) => void;
      onmessageerror?: () => void;
      constructor() { constructions += 1; }
      postMessage(message: { id: number }) { this.onmessage?.({ data: { id: message.id, result: message.id } }); }
      terminate() {}
    });
    const request = {
      kind: "solve" as const,
      config: { wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2, claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 24, modeCount: 1 },
    };
    const first = await runSolverWorker<number>(request);
    const second = await runSolverWorker<number>(request);
    expect(second).toBe(first + 1);
    expect(constructions).toBe(1);
  });

  it("terminates and rejects the active calculation when cancelled", async () => {
    let terminated = false;
    vi.stubGlobal("Worker", class {
      onmessage?: (event: { data: unknown }) => void;
      onerror?: (event: { message: string }) => void;
      onmessageerror?: () => void;
      postMessage() {}
      terminate() { terminated = true; }
    });
    const request = runSolverWorker({
      kind: "solve",
      config: { wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2, claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 24, modeCount: 1 },
    });
    cancelSolverWorker();
    await expect(request).rejects.toMatchObject({ name: "AbortError", message: "Calculation cancelled." });
    expect(terminated).toBe(true);
  });

  it("cleans the request and timer when postMessage throws", async () => {
    const cleared: number[] = [];
    let messageHandler: ((event: { data: unknown }) => void) | undefined;
    vi.stubGlobal("setTimeout", () => 73);
    vi.stubGlobal("clearTimeout", (timer: number) => { cleared.push(timer); });
    vi.stubGlobal("Worker", class {
      set onmessage(handler: ((event: { data: unknown }) => void) | undefined) { messageHandler = handler; }
      onerror?: (event: { message: string }) => void;
      onmessageerror?: () => void;
      postMessage() { throw new DOMException("Cannot clone", "DataCloneError"); }
      terminate() {}
    });
    await expect(runSolverWorker({
      kind: "solve",
      config: { wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2, claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 24, modeCount: 1 },
    })).rejects.toMatchObject({ name: "DataCloneError" });
    expect(cleared).toContain(73);
    expect(messageHandler).toBeTypeOf("function");
  });
});
