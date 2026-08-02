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
    await expect(runSolverWorker<number>(request)).resolves.toBe(1);
    await expect(runSolverWorker<number>(request)).resolves.toBe(2);
    expect(constructions).toBe(1);
  });
});
