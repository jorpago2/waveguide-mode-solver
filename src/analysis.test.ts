import { describe, expect, it } from "vitest";
import { analyzeConvergence, analyzeDirectionalCoupler, analyzeGaussianCoupling, analyzeTolerances, calculateModeMap, compareWaveguides } from "./analysis";
import { evaluateMaterial, evaluateMaterialAxes } from "./materials";
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

  it("maps anisotropic material axes, temperature and a uniform LiNbO3 Pockels bias", () => {
    const room = evaluateMaterialAxes("lithium-niobate", 1.55, 21, "y", 0);
    const hot = evaluateMaterialAxes("lithium-niobate", 1.55, 80, "y", 0);
    const biased = evaluateMaterialAxes("lithium-niobate", 1.55, 21, "y", 1);
    expect(room.nx).toBeGreaterThan(room.ny);
    expect(hot.nx).toBeGreaterThan(room.nx);
    expect(biased.ny).toBeLessThan(room.ny);
    for (const material of ["aluminum-nitride", "gallium-arsenide", "indium-phosphide", "silicon-carbide"] as const) {
      expect(evaluateMaterial(material, 1.55)).toBeGreaterThan(2);
      expect(evaluateMaterial(material, 1.55)).toBeLessThan(4);
    }
  });

  it("classifies the fundamental mode and includes a finite lower stack", () => {
    const nominal = solveWaveguide({ ...config, modeCount: 1 });
    const stacked = solveWaveguide({ ...config, modeCount: 1, substrateIndex: 1.444,
      stackLayers: [{ name: "buffer", thicknessUm: 0.5, material: "custom", index: 1.5 }] });
    expect(nominal.modes[0].label).toMatch(/^(TE|TM)00$/);
    expect(stacked.modes[0].effectiveIndex).toBeGreaterThan(nominal.modes[0].effectiveIndex);
  });

  it("compares modal power overlap between two cross-sections", () => {
    const comparison = compareWaveguides(config, { ...config, widthUm: 1.05 }, 2);
    expect(comparison.powerOverlap[0][0]).toBeGreaterThan(0.8);
    expect(comparison.powerOverlap.flat().every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(comparison.effectiveIndexMismatch[0][0]).toBeGreaterThan(0);
  });

  it("tracks a mode over three grids and reports mesh uncertainty", () => {
    const convergence = analyzeConvergence(config, { coarseResolution: 24, refinementRatio: 1.3, modeIndex: 0, includePmlSensitivity: false, lossTolerancePercent: 10 });
    expect(convergence.levels.map((level) => level.resolution)).toEqual([24, 31, 41]);
    expect(convergence.levels.slice(1).every((level) => level.overlap > 0.8)).toBe(true);
    expect(convergence.monotonic).toBe(true);
    expect(convergence.observedOrder).toBeGreaterThan(0);
    expect(convergence.fineRelativeChangePercent).toBeGreaterThanOrEqual(0);
    expect(convergence.lossFineChangePercent).toBeGreaterThanOrEqual(0);
    expect(convergence.lossValidation).toBe("not-applicable");
    expect(Number.isFinite(convergence.lossRelativeSpreadPercent)).toBe(true);
    expect(convergence.gciFinePercent).toBeGreaterThanOrEqual(0);
    expect(convergence.richardsonEffectiveIndex).toBeGreaterThan(config.claddingIndex);
    expect(() => analyzeConvergence(config, { coarseResolution: 24, refinementRatio: 1.1, modeIndex: 0, includePmlSensitivity: false, lossTolerancePercent: 10 })).toThrow(/refinement ratio/);
    expect(() => analyzeConvergence(config, { coarseResolution: 24, refinementRatio: 1.3, modeIndex: 0, includePmlSensitivity: false, lossTolerancePercent: 0 })).toThrow(/loss tolerance/);
  });

  it("checks PML robustness independently from mesh GCI", () => {
    const convergence = analyzeConvergence({
      ...config, modeCount: 1, boundary: "pml", pmlThicknessUm: 0.6, pmlStrength: 4,
    }, { coarseResolution: 24, refinementRatio: 1.3, modeIndex: 0, includePmlSensitivity: true, lossTolerancePercent: 10 });
    expect(convergence.pmlSensitivity?.points).toHaveLength(4);
    expect(convergence.pmlSensitivity?.points.slice(1).every((point) => point.error || point.overlap! > 0.8)).toBe(true);
    expect(Number.isFinite(convergence.pmlSensitivity?.maximumEffectiveIndexChangePercent)).toBe(true);
    expect(Number.isFinite(convergence.pmlSensitivity?.maximumLossChangePercent)).toBe(true);
    expect(Number.isFinite(convergence.pmlSensitivity?.minimumOverlap)).toBe(true);
    expect(convergence.pmlSensitivity?.points.every((point) => point.error || Number.isFinite(point.lossChangePercent))).toBe(true);
    expect(["pass", "review"]).toContain(convergence.lossValidation);
  }, 30_000);

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
    const settings = { widthStdDevNm: 5, heightStdDevNm: 3, gapStdDevNm: 0, sidewallAngleStdDevDeg: 0.2, coreIndexStdDev: 0.0005, samples: 6, seed: 7, modeIndex: 0 };
    const first = analyzeTolerances({ ...config, sidewallAngleDeg: 80 }, settings);
    const second = analyzeTolerances({ ...config, sidewallAngleDeg: 80 }, settings);
    expect(first.samples).toEqual(second.samples);
    expect(first.effectiveIndex.standardDeviation).toBeGreaterThan(0);
    expect(first.effectiveIndexSensitivity.some((entry) => entry.parameter === "Sidewall angle")).toBe(true);
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
