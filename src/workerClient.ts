import type { SolverWorkerRequest } from "./solver.worker";
import { unpackSolverResult, type PackedSolverResult } from "./solverTransfer";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: number;
}

let worker: Worker | undefined;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function stopWorker(error: Error): void {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) { globalThis.clearTimeout(request.timeout); request.reject(error); }
  pending.clear();
}

export function cancelSolverWorker(): void {
  const error = new Error("Calculation cancelled.");
  error.name = "AbortError";
  stopWorker(error);
}

export function isSolverWorkerCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function solverWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string; packed?: boolean }>) => {
    const request = pending.get(data.id);
    if (!request) return;
    globalThis.clearTimeout(request.timeout);
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.packed ? unpackSolverResult(data.result as PackedSolverResult) : data.result);
  };
  worker.onerror = (event) => stopWorker(new Error(event.message || "The solver worker failed."));
  worker.onmessageerror = () => stopWorker(new Error("The browser could not read the solver result."));
  return worker;
}

export function runSolverWorker<T>(request: SolverWorkerRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    let activeWorker: Worker;
    try {
      activeWorker = solverWorker();
    } catch (caught) {
      reject(caught instanceof Error ? caught : new Error("This browser could not start the solver worker."));
      return;
    }
    const id = nextRequestId++;
    const bentSolve = request.kind === "solve" && (request.config.bendRadiusUm ?? 0) > 0;
    const timeoutMs = bentSolve ? 900_000 : request.kind === "solve" && request.config.gridResolution <= 96 ? 60_000 : 300_000;
    const timeout = globalThis.setTimeout(() => {
      stopWorker(new Error(`The ${request.kind === "solve" ? "mode solve" : "analysis"} timed out. Reduce the mesh resolution, requested modes or sweep samples and try again.`));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
    activeWorker.postMessage({ id, request });
  });
}
