import { describe, expect, it } from "vitest";
import { complexRefractiveIndex, evaluateMaterial, evaluateMaterialAxes, evaluateMetalPermittivity, parseMaterialCsv } from "./materials";

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
  });

  it("rejects extrapolation beyond the source data", () => {
    expect(() => evaluateMaterial("germanium", 1.55)).toThrow(/1.9 to 16/);
    expect(() => evaluateMaterial("arsenic-trisulfide", 12)).toThrow(/0.57 to 11.8/);
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
