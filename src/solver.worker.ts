import { solveWaveguide, sweepGeometry, sweepWaveguide, type GeometrySweepSettings, type SweepSettings, type WaveguideConfig } from "./solver";
import { analyzeConvergence, analyzeDirectionalCoupler, analyzeGaussianCoupling, analyzeTolerances, calculateModeMap, compareWaveguides, type ConvergenceSettings, type DirectionalCouplerSettings, type GaussianCouplingSettings, type ModeMapSettings, type ToleranceSettings } from "./analysis";

export type SolverWorkerRequest =
  | { kind: "solve"; config: WaveguideConfig }
  | { kind: "wavelengthSweep"; config: WaveguideConfig; settings: SweepSettings }
  | { kind: "geometrySweep"; config: WaveguideConfig; settings: GeometrySweepSettings }
  | { kind: "convergence"; config: WaveguideConfig; settings: ConvergenceSettings }
  | { kind: "tolerances"; config: WaveguideConfig; settings: ToleranceSettings }
  | { kind: "gaussianCoupling"; result: ReturnType<typeof solveWaveguide>; modeIndex: number; settings: GaussianCouplingSettings }
  | { kind: "directionalCoupler"; config: WaveguideConfig; settings: DirectionalCouplerSettings }
  | { kind: "compareWaveguides"; sourceConfig: WaveguideConfig; targetConfig: WaveguideConfig; maximumModes: number }
  | { kind: "modeMap"; config: WaveguideConfig; settings: ModeMapSettings };

self.onmessage = ({ data }: MessageEvent<SolverWorkerRequest>) => {
  try {
    const result = data.kind === "solve" ? solveWaveguide(data.config)
      : data.kind === "wavelengthSweep" ? sweepWaveguide(data.config, data.settings)
        : data.kind === "geometrySweep" ? sweepGeometry(data.config, data.settings)
          : data.kind === "convergence" ? analyzeConvergence(data.config, data.settings)
            : data.kind === "tolerances" ? analyzeTolerances(data.config, data.settings)
              : data.kind === "gaussianCoupling" ? analyzeGaussianCoupling(data.result, data.modeIndex, data.settings)
                : data.kind === "directionalCoupler" ? analyzeDirectionalCoupler(data.config, data.settings)
                  : data.kind === "compareWaveguides" ? compareWaveguides(data.sourceConfig, data.targetConfig, data.maximumModes)
                    : calculateModeMap(data.config, data.settings);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The solver failed." });
  }
};
