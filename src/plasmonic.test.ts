import { describe, expect, it } from "vitest";
import { complexRefractiveIndex, evaluateMetalPermittivity } from "./materials";
import { solveWaveguide, validateWaveguide, type WaveguideConfig } from "./solver";

const planarGoldAir: WaveguideConfig = {
  geometry: "multilayer",
  wavelengthUm: 1.55,
  widthUm: 0.1,
  heightUm: 0.2,
  coreIndex: 1,
  claddingIndex: 1,
  substrateIndex: 0.5,
  coreMaterial: "air",
  claddingMaterial: "air",
  substrateMaterial: "gold",
  paddingUm: 5,
  gridResolution: 64,
  modeCount: 1,
  boundary: "hard",
};

function analyticSurfacePlasmonIndex(): number {
  const metal = evaluateMetalPermittivity("gold", planarGoldAir.wavelengthUm);
  const denominator = { real: metal.real + 1, imaginary: metal.imaginary };
  const magnitudeSquared = denominator.real ** 2 + denominator.imaginary ** 2;
  const ratio = {
    real: (metal.real * denominator.real + metal.imaginary * denominator.imaginary) / magnitudeSquared,
    imaginary: (metal.imaginary * denominator.real - metal.real * denominator.imaginary) / magnitudeSquared,
  };
  return complexRefractiveIndex(ratio).n;
}

describe("plasmonic mode solver", () => {
  it("requires a metal-dielectric interface", () => {
    const errors = validateWaveguide({ ...planarGoldAir, geometry: "channel", coreMaterial: "gold", claddingMaterial: "gold" });
    expect(errors.join(" ")).toContain("requires an interface");
  });

  it("recovers the planar gold-air surface-plasmon index", () => {
    expect(validateWaveguide(planarGoldAir)).toEqual([]);
    const result = solveWaveguide(planarGoldAir);
    expect(result.modes).toHaveLength(1);
    expect(result.modes[0].polarization).toBe("quasi-TM");
    expect(Math.abs(result.modes[0].effectiveIndex - analyticSurfacePlasmonIndex())).toBeLessThan(0.01);
    expect(result.modes[0].effectiveIndexImaginary).toBeGreaterThan(0);
    expect(result.modes[0].propagationLengthUm).toBeGreaterThan(0);
    expect(result.modes[0].absorbedPowerPerM).toBeGreaterThan(0);
    expect(result.modes[0].materialAbsorption.some((entry) => entry.region === "Base substrate" && entry.fraction > 0.9)).toBe(true);
    expect(Number.isFinite(result.modes[0].lossBalanceRelativeDifference)).toBe(true);
    expect(Math.min(...result.permittivity.real.x.flat())).toBeLessThan(0);
    expect(Math.max(...result.permittivity.imaginary.x.flat())).toBeGreaterThan(0);
  }, 20_000);

  it("finds the lossy mode of a gold stripe in silica", () => {
    const result = solveWaveguide({
      ...planarGoldAir,
      geometry: "channel",
      widthUm: 0.5,
      heightUm: 0.2,
      coreMaterial: "gold",
      claddingMaterial: "silica",
      claddingIndex: 1.444,
      paddingUm: 1.5,
    });
    expect(result.modes).toHaveLength(1);
    expect(result.modes[0].lossDbPerCm).toBeGreaterThan(0);
  }, 20_000);
});
