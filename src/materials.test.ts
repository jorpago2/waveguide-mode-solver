import { describe, expect, it } from "vitest";
import { complexRefractiveIndex, evaluateMaterial, evaluateMaterialAxes, evaluateMaterialExtinction, evaluateMetalPermittivity, parseMaterialCsv } from "./materials";

describe("dispersive dielectric materials", () => {
  it("reproduces published refractive-index checkpoints", () => {
    expect(evaluateMaterial("germanium", 4)).toBeCloseTo(4.02495, 5);
    expect(evaluateMaterial("arsenic-trisulfide", 0.8)).toBeCloseTo(2.52090, 5);

    const sapphire = evaluateMaterialAxes("sapphire", 1.064);
    expect(sapphire.nx).toBeCloseTo(1.75449, 5);
    expect(sapphire.ny).toBeCloseTo(1.74663, 5);

    const magnesiumFluoride = evaluateMaterialAxes("magnesium-fluoride", 1);
    expect(magnesiumFluoride.nx).toBeCloseTo(1.37358, 5);
    expect(magnesiumFluoride.ny).toBeCloseTo(1.38519, 5);

    expect(evaluateMaterial("diamond", 1.55)).toBeCloseTo(2.38383, 5);
    expect(evaluateMaterial("calcium-fluoride", 1.55)).toBeCloseTo(1.42602, 5);
    expect(evaluateMaterial("pmma", 0.5893)).toBeCloseTo(1.49054, 5);
    expect(evaluateMaterial("arsenic-selenide", 1.55)).toBeCloseTo(2.63276, 5);
    const galliumNitride = evaluateMaterialAxes("gallium-nitride", 1.55);
    expect(galliumNitride.nx).toBeCloseTo(2.31689, 5);
    expect(galliumNitride.ny).toBeCloseTo(2.30545, 5);
  });

  it("rejects extrapolation beyond the source data", () => {
    expect(() => evaluateMaterial("germanium", 1.55)).toThrow(/1.9 to 16/);
    expect(() => evaluateMaterial("arsenic-trisulfide", 12)).toThrow(/0.57 to 11.8/);
  });

  it("uses measured extinction only inside its documented bands", () => {
    expect(evaluateMaterialExtinction("silicon", 1.2)).toBeCloseTo(2.1008e-7, 11);
    expect(evaluateMaterialExtinction("silicon", 1.55)).toBeUndefined();
    expect(evaluateMaterialExtinction("silicon", 10)).toBeCloseTo(7.4e-5, 9);
    expect(evaluateMaterialExtinction("germanium", 2)).toBeCloseTo(4.634e-6, 10);
    expect(evaluateMaterialExtinction("germanium", 3)).toBeUndefined();
    expect(evaluateMaterialExtinction("arsenic-trisulfide", 1.53)).toBeCloseTo(1.2175353e-7, 12);
    expect(evaluateMaterialExtinction("arsenic-trisulfide", 10)).toBeUndefined();
  });
});

describe("metal materials", () => {
  it("reproduces the Lorentz-Drude gold optical constants", () => {
    const epsilon = evaluateMetalPermittivity("gold", 0.6328);
    const index = complexRefractiveIndex(epsilon);
    expect(epsilon.real).toBeCloseTo(-9.80014, 4);
    expect(epsilon.imaginary).toBeCloseTo(1.96488, 4);
    expect(index.n).toBeCloseTo(0.31228, 4);
    expect(index.k).toBeCloseTo(3.14605, 4);
    expect(epsilon.imaginary).toBeGreaterThan(0);
  });

  it("accepts passive tabulated metal n,k data", () => {
    const table = parseMaterialCsv("wavelength_um,n,k\n1.5,0.4,8\n1.6,0.5,9", "metal.csv");
    expect(table.refractiveIndex).toEqual([0.4, 0.5]);
  });
});
