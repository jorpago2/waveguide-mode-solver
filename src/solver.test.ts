import { describe, expect, it } from "vitest";
import { solveWaveguide, validateWaveguide, type WaveguideConfig } from "./solver";

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
});
