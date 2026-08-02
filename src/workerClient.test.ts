import { afterEach, describe, expect, it, vi } from "vitest";
import { runSolverWorker } from "./workerClient";

describe("solver worker client", () => {
  afterEach(() => vi.unstubAllGlobals());

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
});
