import { describe, expect, it } from "vitest";
import { solveWaveguide } from "./solver";
import { packSolverResult, unpackSolverResult } from "./solverTransfer";

describe("solver result transfer", () => {
  it("round-trips field grids through transferable typed arrays", () => {
    const original = solveWaveguide({
      wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2,
      claddingIndex: 1.444, paddingUm: 1.2, gridResolution: 24, modeCount: 1,
    });
    const packed = packSolverResult(original);
    const restored = unpackSolverResult(packed.result);
    expect(packed.transfer.length).toBe(26);
    expect(restored.modes[0].effectiveIndex).toBe(original.modes[0].effectiveIndex);
    expect(restored.modes[0].fields.Ex[0][0]).toBe(Math.fround(original.modes[0].fields.Ex[0][0]));
    expect(restored.modes[0].complexFields.Ex.imaginary[0][0]).toBe(Math.fround(original.modes[0].complexFields.Ex.imaginary[0][0]));
    expect(restored.permittivity.real.x[0][0]).toBe(Math.fround(original.permittivity.real.x[0][0]));
  });
});
