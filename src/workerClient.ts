import type { SolverWorkerRequest } from "./solver.worker";

export function runSolverWorker<T>(request: SolverWorkerRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    } catch (caught) {
      reject(caught instanceof Error ? caught : new Error("This browser could not start the solver worker."));
      return;
    }
    const timeoutMs = request.kind === "solve" ? 45_000 : 300_000;
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`The ${request.kind === "solve" ? "mode solve" : "analysis"} timed out. Reduce the mesh resolution, requested modes or sweep samples and try again.`));
    }, timeoutMs);
    const finish = () => window.clearTimeout(timeout);
    worker.onmessage = ({ data }: MessageEvent<{ result?: T; error?: string }>) => {
      finish();
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result as T);
    };
    worker.onerror = (event) => { finish(); worker.terminate(); reject(new Error(event.message || "The solver worker failed.")); };
    worker.onmessageerror = () => { finish(); worker.terminate(); reject(new Error("The browser could not read the solver result.")); };
    worker.postMessage(request);
  });
}
