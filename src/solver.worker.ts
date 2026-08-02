import { solveWaveguide, sweepGeometry, sweepWaveguide, type GeometrySweepSettings, type SweepSettings, type WaveguideConfig } from "./solver";

export type SolverWorkerRequest =
  | { kind: "solve"; config: WaveguideConfig }
  | { kind: "wavelengthSweep"; config: WaveguideConfig; settings: SweepSettings }
  | { kind: "geometrySweep"; config: WaveguideConfig; settings: GeometrySweepSettings };

self.onmessage = ({ data }: MessageEvent<SolverWorkerRequest>) => {
  try {
    const result = data.kind === "solve" ? solveWaveguide(data.config)
      : data.kind === "wavelengthSweep" ? sweepWaveguide(data.config, data.settings)
        : sweepGeometry(data.config, data.settings);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The solver failed." });
  }
};
