import { describe, expect, it } from "vitest";
import { analyzeDirectionalCoupler, analyzeGaussianCoupling, analyzeTolerances, calculateModeMap } from "./analysis";
import { evaluateMaterial } from "./materials";
import { solveWaveguide, validateWaveguide, type WaveguideConfig } from "./solver";

const config: WaveguideConfig = {
  wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2,
  claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 24, modeCount: 3,
};

describe("photonic design analyses", () => {
  it("evaluates published material models at 1.55 µm", () => {
    expect(evaluateMaterial("silica", 1.55)).toBeCloseTo(1.44402, 4);
    expect(evaluateMaterial("silicon", 1.55)).toBeCloseTo(3.47589, 4);
    expect(evaluateMaterial("silicon-nitride", 1.55)).toBeCloseTo(1.99628, 4);
    expect(() => evaluateMaterial("silica", 5)).toThrow(/valid from/);
    expect(validateWaveguide({ ...config, wavelengthUm: 5, claddingMaterial: "silica" })).toContain("Fused silica is valid from 0.21 to 3.71 µm.");
  });

  it("uses library dispersion inside the full-vector solver", () => {
    const result = solveWaveguide({ ...config, coreMaterial: "silicon-nitride", claddingMaterial: "silica" });
    expect(result.modes[0].effectiveIndex).toBeGreaterThan(evaluateMaterial("silica", 1.55));
    expect(result.modes[0].effectiveIndex).toBeLessThan(evaluateMaterial("silicon-nitride", 1.55));
  });

  it("computes a bounded Gaussian coupling efficiency", () => {
    const result = solveWaveguide(config);
    const coupling = analyzeGaussianCoupling(result, 0, { waistUm: 1.5, offsetXUm: 0, offsetYUm: 0, polarizationAngleDeg: 0 });
    expect(coupling.efficiency).toBeGreaterThan(0);
    expect(coupling.efficiency).toBeLessThanOrEqual(1);
    expect(coupling.couplingLossDb).toBeGreaterThanOrEqual(0);
  });

  it("identifies even and odd coupler supermodes", () => {
    const coupling = analyzeDirectionalCoupler(config, { gapUm: 0.2, polarization: "quasi-TE" });
    expect(coupling.evenParity).toBeGreaterThan(0.9);
    expect(coupling.oddParity).toBeLessThan(-0.9);
    expect(coupling.indexSplitting).toBeGreaterThan(0);
    expect(coupling.couplingLengthUm).toBeGreaterThan(0);
  });

  it("repeats the same tolerance study for a fixed seed", () => {
    const settings = { widthStdDevNm: 5, heightStdDevNm: 3, gapStdDevNm: 0, coreIndexStdDev: 0.0005, samples: 6, seed: 7, modeIndex: 0 };
    const first = analyzeTolerances(config, settings);
    const second = analyzeTolerances(config, settings);
    expect(first.samples).toEqual(second.samples);
    expect(first.effectiveIndex.standardDeviation).toBeGreaterThan(0);
  });

  it("maps modal cutoff changes over wavelength and width", () => {
    const map = calculateModeMap(config, { parameter: "widthUm", startValueUm: 0.9, stopValueUm: 1.1,
      geometryPoints: 3, startWavelengthUm: 1.5, stopWavelengthUm: 1.6, wavelengthPoints: 3,
      maximumModes: 3, gridResolution: 24, modeIndex: 0 });
    expect(map.modeCount).toHaveLength(3);
    expect(map.modeCount.every((row) => row.length === 3)).toBe(true);
    expect(new Set(map.modeCount.flat()).size).toBeGreaterThan(1);
  });
});
