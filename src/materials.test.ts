import { describe, expect, it } from "vitest";
import { complexRefractiveIndex, evaluateMetalPermittivity, parseMaterialCsv } from "./materials";

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
