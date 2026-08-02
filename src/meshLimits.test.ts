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
  modeCount: PARAMETER_MAXIMUMS.modeCount,
};

describe("mesh limits", () => {
  it("solves the maximum supported mesh and mode count", () => {
    const result = solveWaveguide(maximumMeshCase);
    expect(result.nx).toBe(PARAMETER_MAXIMUMS.gridResolution);
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes.every((mode) => Number.isFinite(mode.effectiveIndex))).toBe(true);
  }, 60_000);
});
