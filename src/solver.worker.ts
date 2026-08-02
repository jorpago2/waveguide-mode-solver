import type { GeometrySweepSettings, SweepSettings, WaveguideConfig } from "./solver";
import type { ConvergenceSettings, DirectionalCouplerSettings, GaussianCouplingSettings, ModeMapSettings, ToleranceSettings } from "./analysis";
import { packSolverResult } from "./solverTransfer";

export type SolverWorkerRequest =
  | { kind: "solve"; config: WaveguideConfig }
  | { kind: "wavelengthSweep"; config: WaveguideConfig; settings: SweepSettings }
  | { kind: "geometrySweep"; config: WaveguideConfig; settings: GeometrySweepSettings }
  | { kind: "convergence"; config: WaveguideConfig; settings: ConvergenceSettings }
  | { kind: "tolerances"; config: WaveguideConfig; settings: ToleranceSettings }
  | { kind: "gaussianCoupling"; result: import("./solver").SolverResult; modeIndex: number; settings: GaussianCouplingSettings }
  | { kind: "directionalCoupler"; config: WaveguideConfig; settings: DirectionalCouplerSettings }
  | { kind: "compareWaveguides"; sourceConfig: WaveguideConfig; targetConfig: WaveguideConfig; maximumModes: number }
  | { kind: "modeMap"; config: WaveguideConfig; settings: ModeMapSettings };

self.onmessage = async ({ data }: MessageEvent<{ id?: number; request?: SolverWorkerRequest } | SolverWorkerRequest>) => {
  const envelope = data as { id?: number; request?: SolverWorkerRequest };
  const id = envelope.request ? envelope.id : undefined;
  const request = envelope.request ?? data as SolverWorkerRequest;
  try {
    const [{ solveWaveguide, sweepGeometry, sweepWaveguide }, { analyzeConvergence, analyzeDirectionalCoupler, analyzeGaussianCoupling, analyzeTolerances, calculateModeMap, compareWaveguides }] = await Promise.all([
      import("./solver"), import("./analysis"),
    ]);
    const result = request.kind === "solve" ? solveWaveguide(request.config)
      : request.kind === "wavelengthSweep" ? sweepWaveguide(request.config, request.settings)
        : request.kind === "geometrySweep" ? sweepGeometry(request.config, request.settings)
          : request.kind === "convergence" ? analyzeConvergence(request.config, request.settings)
            : request.kind === "tolerances" ? analyzeTolerances(request.config, request.settings)
              : request.kind === "gaussianCoupling" ? analyzeGaussianCoupling(request.result, request.modeIndex, request.settings)
                : request.kind === "directionalCoupler" ? analyzeDirectionalCoupler(request.config, request.settings)
                  : request.kind === "compareWaveguides" ? compareWaveguides(request.sourceConfig, request.targetConfig, request.maximumModes)
                    : calculateModeMap(request.config, request.settings);
    if (request.kind === "solve" && id !== undefined) {
      const packed = packSolverResult(result as import("./solver").SolverResult);
      self.postMessage({ id, result: packed.result, packed: true }, { transfer: packed.transfer });
    } else self.postMessage(id === undefined ? { result } : { id, result });
  } catch (error) {
    const response = { error: error instanceof Error ? error.message : "The solver failed." };
    self.postMessage(id === undefined ? response : { id, ...response });
  }
};
