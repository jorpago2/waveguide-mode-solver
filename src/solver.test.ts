import { describe, expect, it } from "vitest";
import { parseNumericInput } from "./numericInput";
import { solveWaveguide, sweepGeometry, sweepWaveguide, validateWaveguide, type GeometryType, type WaveguideConfig } from "./solver";

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

function fieldRoughness(field: number[][]): number {
  let differences = 0;
  let energy = 0;
  for (let row = 0; row < field.length; row += 1) {
    for (let column = 0; column < field[row].length; column += 1) {
      const value = field[row][column];
      energy += value ** 2;
      if (column + 1 < field[row].length) differences += (value - field[row][column + 1]) ** 2;
      if (row + 1 < field.length) differences += (value - field[row + 1][column]) ** 2;
    }
  }
  return differences / energy;
}

describe("full-vector finite-difference mode solver", () => {
  it("allows a numeric input to be cleared before entering a replacement", () => {
    expect(parseNumericInput("")).toBeNaN();
    expect(parseNumericInput("0.25")).toBe(0.25);
  });

  it("converges toward the subpixel-interface reference", () => {
    const result = solveWaveguide(benchmark);
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes[0].effectiveIndex).toBeCloseTo(1.64, 1);
    expect(result.modes[1].effectiveIndex).toBeCloseTo(1.57, 1);
    expect(result.modes[0].residual).toBeLessThan(2e-3);
  });

  it("converges the modal field on the finest supported uniform grid", () => {
    const coarse = solveWaveguide({ ...benchmark, gridResolution: 32, modeCount: 1 }).modes[0];
    const fine = solveWaveguide({ ...benchmark, gridResolution: 96, modeCount: 1 }).modes[0];
    expect(fine.residual).toBeLessThan(1e-3);
    expect(fieldRoughness(fine.fields.Ex)).toBeLessThan(fieldRoughness(coarse.fields.Ex) / 4);
  }, 10_000);

  it("returns physical vector-field metrics", () => {
    const mode = solveWaveguide({ ...benchmark, modeCount: 1 }).modes[0];
    expect(mode.effectiveIndex).toBeGreaterThan(benchmark.claddingIndex);
    expect(mode.effectiveIndex).toBeLessThan(benchmark.coreIndex);
    expect(mode.electricConfinement).toBeGreaterThan(0);
    expect(mode.electricConfinement).toBeLessThan(1);
    expect(mode.longitudinalElectricFraction).toBeGreaterThanOrEqual(0);
    expect(mode.fields.Ex).toHaveLength(26);
    expect(mode.fields.Ex[0]).toHaveLength(32);
    expect(mode.modalPowerW).toBeCloseTo(1, 8);
    expect(mode.peakPoyntingWPerM2).toBeGreaterThan(0);
  });

  it("rejects a non-guiding index profile", () => {
    expect(validateWaveguide({ ...benchmark, coreIndex: 1.4, claddingIndex: 1.5 })).not.toHaveLength(0);
  });

  it("accepts the expanded parameter range", () => {
    expect(validateWaveguide({
      ...benchmark,
      wavelengthUm: 100,
      widthUm: 100,
      heightUm: 50,
      paddingUm: 100,
      coreIndex: 10,
      claddingIndex: 2,
      gridResolution: 80,
      modeCount: 6,
    })).toHaveLength(0);
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

  it("returns a complex effective index with stretched-coordinate PML", () => {
    const mode = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1,
      boundary: "pml", pmlThicknessUm: 0.6, pmlStrength: 4,
    }).modes[0];
    expect(mode.effectiveIndexImaginary).toBeGreaterThan(0);
    expect(mode.lossDbPerCm).toBeGreaterThan(0);
    expect(mode.modalPowerW).toBeCloseTo(1, 8);
    expect(mode.residual).toBeLessThan(5e-3);
  });

  it("tracks a mode through a geometry sweep", () => {
    const sweep = sweepGeometry({ ...benchmark, gridResolution: 24, modeCount: 2 }, {
      parameter: "widthUm", startValueUm: 0.9, stopValueUm: 1.1, points: 3, modeIndex: 0,
    });
    expect(sweep.points).toHaveLength(3);
    expect(Math.min(...sweep.points.map((point) => point.overlap))).toBeGreaterThan(0.7);
  });
});
