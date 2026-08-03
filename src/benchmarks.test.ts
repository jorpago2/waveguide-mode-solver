import { describe, expect, it } from "vitest";
import { evaluateMetalPermittivity } from "./materials";
import { symmetricPlanarTmMode, symmetricSlabTe0EffectiveIndex } from "./benchmarks";
import { solveWaveguide } from "./solver";

describe("analytical reference benchmarks", () => {
  it("solves the symmetric dielectric-slab TE0 dispersion relation", () => {
    const effectiveIndex = symmetricSlabTe0EffectiveIndex(1.55, 0.399, 2, 1.444);
    expect(effectiveIndex).toBeGreaterThan(1.444);
    expect(effectiveIndex).toBeLessThan(2);
    expect(effectiveIndex).toBeCloseTo(1.7461, 3);
    const numerical = solveWaveguide({
      geometry: "rib", slabHeightUm: 0.399, wavelengthUm: 1.55, widthUm: 4, heightUm: 0.4,
      coreIndex: 2, claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 64, modeCount: 2,
    });
    expect(Math.min(...numerical.modes.map((mode) => Math.abs(mode.effectiveIndex - effectiveIndex)))).toBeLessThan(0.03);
  });

  it("converges the symmetric MIM and IMI TM dispersion relations", () => {
    const gold = evaluateMetalPermittivity("gold", 1.55);
    const silica = { real: 1.444 ** 2, imaginary: 0 };
    const mim = symmetricPlanarTmMode(1.55, 0.1, silica, gold, { real: 1.7, imaginary: 0.01 });
    const imi = symmetricPlanarTmMode(1.55, 0.05, gold, silica, { real: 1.45, imaginary: 0.001 });
    for (const mode of [mim, imi]) {
      expect(mode.residual).toBeLessThan(1e-8);
      expect(mode.effectiveIndex.real).toBeGreaterThan(1);
      expect(mode.effectiveIndex.imaginary).toBeGreaterThan(0);
    }
    expect(mim.effectiveIndex.real).toBeGreaterThan(imi.effectiveIndex.real);
  });
});
