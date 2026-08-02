import { describe, expect, it } from "vitest";
import { parseNumericInput } from "./numericInput";
import { solveWaveguide, sweepWaveguide, validateWaveguide, type GeometryType, type WaveguideConfig } from "./solver";

const benchmark: WaveguideConfig = {
  wavelengthUm: 1.55,
  widthUm: 1,
  heightUm: 0.4,
  coreIndex: 2,
  claddingIndex: 1.444,
  paddingUm: 1.2,
  gridResolution: 32,
  modeCount: 2,
};

describe("full-vector finite-difference mode solver", () => {
  it("allows a numeric input to be cleared before entering a replacement", () => {
    expect(parseNumericInput("")).toBeNaN();
    expect(parseNumericInput("0.25")).toBe(0.25);
  });

  it("matches the reference Yee-grid implementation", () => {
    const result = solveWaveguide(benchmark);
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes[0].effectiveIndex).toBeCloseTo(1.66415615, 2);
    expect(result.modes[1].effectiveIndex).toBeCloseTo(1.60326769, 2);
    expect(result.modes[0].residual).toBeLessThan(2e-3);
  });

  it("returns physical vector-field metrics", () => {
    const mode = solveWaveguide({ ...benchmark, modeCount: 1 }).modes[0];
    expect(mode.effectiveIndex).toBeGreaterThan(benchmark.claddingIndex);
    expect(mode.effectiveIndex).toBeLessThan(benchmark.coreIndex);
    expect(mode.electricConfinement).toBeGreaterThan(0);
    expect(mode.electricConfinement).toBeLessThan(1);
    expect(mode.longitudinalElectricFraction).toBeGreaterThanOrEqual(0);
    expect(mode.fields.Ex).toHaveLength(26);
    expect(mode.fields.Ex[0]).toHaveLength(32);
  });

  it("rejects a non-guiding index profile", () => {
    expect(validateWaveguide({ ...benchmark, coreIndex: 1.4, claddingIndex: 1.5 })).not.toHaveLength(0);
  });

  it("supports graded meshes, diagonal anisotropy, loss and each geometry", () => {
    const geometries: GeometryType[] = ["channel", "rib", "slot", "multilayer"];
    for (const geometry of geometries) {
      const result = solveWaveguide({
        ...benchmark,
        geometry,
        modeCount: 1,
        meshBias: 1.2,
        slabHeightUm: 0.15,
        slotGapUm: 0.12,
        substrateIndex: 1.44,
        coreIndexY: 2.02,
        coreIndexZ: 1.98,
        coreExtinction: 1e-6,
      });
      expect(result.modes.length).toBe(1);
      expect(result.dxMaxUm).toBeGreaterThan(result.dxUm);
      expect(result.modes[0].lossDbPerCm).toBeGreaterThan(0);
    }
  });

  it("tracks a mode and derives finite group index and dispersion", () => {
    const sweep = sweepWaveguide({ ...benchmark, modeCount: 2 }, {
      startWavelengthUm: 1.5,
      stopWavelengthUm: 1.6,
      points: 5,
      modeIndex: 0,
    });
    expect(sweep.points).toHaveLength(5);
    expect(sweep.points.every((point) => Number.isFinite(point.groupIndex))).toBe(true);
    expect(sweep.points.every((point) => Number.isFinite(point.dispersionPsPerNmKm))).toBe(true);
    expect(Math.min(...sweep.points.map((point) => point.overlap))).toBeGreaterThan(0.7);
  });
});
