import type { SolverWorkerRequest } from "./solver.worker";

export function runSolverWorker<T>(request: SolverWorkerRequest): Promise<T> {
  const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<{ result?: T; error?: string }>) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result as T);
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || "The solver worker failed.")); };
    worker.postMessage(request);
  });
}
