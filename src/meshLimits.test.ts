import { describe, expect, it } from "vitest";
import { PARAMETER_MAXIMUMS, solveWaveguide, type WaveguideConfig } from "./solver";

const maximumMeshCase: WaveguideConfig = {
  wavelengthUm: 1.55,
  widthUm: 1,
  heightUm: 0.4,
  coreIndex: 2,
  claddingIndex: 1.444,
  paddingUm: 1.2,
  gridResolution: PARAMETER_MAXIMUMS.gridResolution,
  modeCount: 1,
};

describe("mesh limits", () => {
  it("solves the maximum supported mesh resolution", () => {
    const result = solveWaveguide(maximumMeshCase);
    expect(result.nx).toBe(PARAMETER_MAXIMUMS.gridResolution);
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes.every((mode) => Number.isFinite(mode.effectiveIndex))).toBe(true);
    expect(result.modes[0].residual).toBeLessThan(2e-3);
    const reference = solveWaveguide({ ...maximumMeshCase, gridResolution: 128 });
    expect(result.modes[0].effectiveIndex).toBeCloseTo(reference.modes[0].effectiveIndex, 2);
  }, 300_000);

  it("solves the maximum supported mode count", () => {
    const result = solveWaveguide({ ...maximumMeshCase, gridResolution: 64, modeCount: PARAMETER_MAXIMUMS.modeCount });
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes.every((mode) => Number.isFinite(mode.effectiveIndex))).toBe(true);
  }, 60_000);
});
