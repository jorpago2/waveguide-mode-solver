import { describe, expect, it } from "vitest";
import { interpolateFieldMatrix, NORMALIZED_MODAL_POWER_W, PARAMETER_MAXIMUMS, solveWaveguide, sweepBlochPhase, sweepGeometry, sweepWaveguide, validateWaveguide, type GeometryType, type WaveguideConfig } from "./solver";

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

function horizontalCentroid(field: number[][], xUm: number[]): number {
  let weightedPosition = 0;
  let total = 0;
  for (const row of field) {
    for (let column = 0; column < row.length; column += 1) {
      weightedPosition += xUm[column] * row[column];
      total += row[column];
    }
  }
  return weightedPosition / total;
}

describe("full-vector finite-difference mode solver", () => {
  it("interpolates a display mesh without changing the solver samples", () => {
    const field = [[0, 1], [4, 5]];
    const interpolated = interpolateFieldMatrix(field, [0, 1], [0, 2], 2);
    expect(interpolated.x).toEqual([0, 0.5, 1]);
    expect(interpolated.y).toEqual([0, 1, 2]);
    expect(interpolated.values).toEqual([[0, 0.5, 1], [2, 2.5, 3], [4, 4.5, 5]]);
    expect(field).toEqual([[0, 1], [4, 5]]);
  });

  it("selects independent automatic mesh grading on each axis", () => {
    const result = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, autoMeshBias: true });
    expect(result.meshBiasX).toBeGreaterThan(0);
    expect(result.meshBiasY).toBeGreaterThan(result.meshBiasX);
    expect(result.meshBiasY).toBeLessThanOrEqual(PARAMETER_MAXIMUMS.meshBias);
    expect(result.dxUm).toBeLessThan(result.dxMaxUm);
    expect(result.dyUm).toBeLessThan(result.dyMaxUm);
  });

  it("retains linearly independent modes at a physical degeneracy", () => {
    const squareGuide = { ...benchmark, widthUm: 1, heightUm: 1, gridResolution: 24, modeCount: 4 };
    const result = solveWaveguide(squareGuide);
    const degeneratePair = result.modes.some((mode, index) => result.modes.some((candidate, candidateIndex) => (
      candidateIndex > index && Math.abs(candidate.effectiveIndex - mode.effectiveIndex) <= 1e-4
    )));
    expect(degeneratePair).toBe(true);
    const sweep = sweepGeometry(squareGuide, { parameter: "widthUm", startValueUm: 0.95, stopValueUm: 1.05, points: 3, modeIndex: 0 });
    expect(Math.max(...sweep.points.map((point) => point.degenerateSubspaceSize))).toBeGreaterThan(1);
  });

  it("converges toward the subpixel-interface reference", () => {
    const result = solveWaveguide(benchmark);
    expect(result.backend).toBe("Rust/WASM");
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes[0].effectiveIndex).toBeCloseTo(1.64, 1);
    expect(result.modes[1].effectiveIndex).toBeCloseTo(1.57, 1);
    expect(result.modes[0].residual).toBeLessThan(2e-3);
  });

  it("converges the modal field on the finest supported uniform grid", () => {
    const coarse = solveWaveguide({ ...benchmark, gridResolution: 32, modeCount: 1 }).modes[0];
    const fineResult = solveWaveguide({ ...benchmark, gridResolution: 96, modeCount: 1 });
    const fine = fineResult.modes[0];
    expect(fine.residual).toBeLessThan(1e-3);
    expect(fieldRoughness(fine.fields.Ex)).toBeLessThan(fieldRoughness(coarse.fields.Ex) / 4);
    expect(fineResult.xEdgesUm).toContain(benchmark.widthUm / 2);
    expect(fineResult.yEdgesUm).toContain(benchmark.heightUm / 2);
  }, 20_000);

  it("returns physical vector-field metrics", () => {
    const result = solveWaveguide({ ...benchmark, modeCount: 1 });
    const mode = result.modes[0];
    expect(mode.effectiveIndex).toBeGreaterThan(benchmark.claddingIndex);
    expect(mode.effectiveIndex).toBeLessThan(benchmark.coreIndex);
    expect(mode.electricConfinement).toBeGreaterThan(0);
    expect(mode.electricConfinement).toBeLessThan(1);
    expect(mode.corePowerFraction).toBeGreaterThan(0);
    expect(mode.corePowerFraction).toBeLessThan(1);
    expect(mode.longitudinalElectricFraction).toBeGreaterThanOrEqual(0);
    expect(mode.fields.Ex).toHaveLength(26);
    expect(mode.fields.Ex[0]).toHaveLength(32);
    expect(mode.modalPowerW).toBeCloseTo(NORMALIZED_MODAL_POWER_W, 8);
    expect(mode.complexFields.Ex.imaginary).toHaveLength(result.ny);
    expect(mode.complexFields.Hz.real[0]).toHaveLength(result.nx);
    expect(mode.propagationLengthUm).toBe(Number.POSITIVE_INFINITY);
    expect(mode.peakPoyntingWPerM2).toBeGreaterThan(0);
    expect(mode.storedEnergyPerM).toBeGreaterThan(0);
    expect(mode.energyConfinement).toBeGreaterThan(0);
    expect(mode.energyConfinement).toBeLessThan(1);
    expect(mode.energyEffectiveAreaUm2).toBeGreaterThan(0);
    expect(mode.energyGroupIndex).toBeGreaterThan(1);
    expect(mode.energyMetricValidity).toBe("lossless");
    expect(mode.physicalClass).toBe("guided");
    expect(result.xEdgesUm).toHaveLength(result.nx + 1);
    expect(result.yEdgesUm).toHaveLength(result.ny + 1);
    expect(result.permittivity.real.x).toHaveLength(result.ny);
    expect(result.permittivity.imaginary.x).toHaveLength(result.ny);
    expect(result.permittivity.real.x[0]).toHaveLength(result.nx);
    expect(Math.max(...result.permittivity.real.x.flat())).toBeGreaterThan(Math.min(...result.permittivity.real.x.flat()));
  });

  it("targets an effective index and reports every Ritz candidate", () => {
    const result = solveWaveguide({ ...benchmark, modeCount: 1, targetEffectiveIndex: 1.65, targetEffectiveIndexImaginary: 0 });
    expect(result.searchTargetEffectiveIndex).toBe(1.65);
    expect(result.candidates.length).toBeGreaterThan(result.modes.length);
    expect(result.candidates.some((candidate) => candidate.status === "selected" && candidate.label)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.reason.length > 0)).toBe(true);
  });

  it("rejects a non-guiding index profile", () => {
    expect(validateWaveguide({ ...benchmark, coreIndex: 1.4, claddingIndex: 1.5 })).not.toHaveLength(0);
    expect(validateWaveguide({ ...benchmark, bendRadiusUm: 1 })).toContain("Bend radius must exceed the radial half-domain so the cylindrical metric remains positive.");
  });

  it("models etched sidewalls as a wider trapezoidal base", () => {
    const vertical = solveWaveguide({ ...benchmark, modeCount: 1, sidewallAngleDeg: 90 }).modes[0];
    const angled = solveWaveguide({ ...benchmark, modeCount: 1, sidewallAngleDeg: 70 }).modes[0];
    expect(angled.effectiveIndex).toBeGreaterThan(vertical.effectiveIndex);
    expect(validateWaveguide({ ...benchmark, sidewallAngleDeg: 10 })).not.toHaveLength(0);
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
  }, 10_000);

  it("solves transverse and longitudinally coupled uniaxial tensors in Rust/WebAssembly", () => {
    const rotated = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1, coreIndex: 2.2,
      coreMaterial: "lithium-niobate", coreOpticAxisTiltDeg: 45, coreOpticAxisAzimuthDeg: 90,
    });
    expect(rotated.formulation).toBe("first-order");
    expect(rotated.backend).toBe("Rust/WASM");
    expect(rotated.modes[0].effectiveIndex).toBeGreaterThan(benchmark.claddingIndex);
    expect(rotated.modes[0].residual).toBeLessThan(2e-2);
    const longitudinal = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1, coreIndex: 2.2,
      coreMaterial: "lithium-niobate", coreOpticAxisTiltDeg: 90, coreOpticAxisAzimuthDeg: 45,
    });
    expect(longitudinal.backend).toBe("Rust/WASM");
    expect(longitudinal.modes[0].effectiveIndex).toBeGreaterThan(benchmark.claddingIndex);
    expect(longitudinal.modes[0].residual).toBeLessThan(2e-2);
    expect(validateWaveguide({
      ...benchmark, coreIndex: 2.2, coreMaterial: "lithium-niobate",
      coreOpticAxisTiltDeg: 90, coreOpticAxisAzimuthDeg: 45, boundary: "pml",
    }).join(" ")).toMatch(/lossless materials and a hard outer boundary/);
    const tabulated = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1, coreMaterial: "tabulated",
      coreMaterialTable: { name: "measured", wavelengthUm: [1.5, 1.6], refractiveIndex: [2.05, 1.95], extinctionCoefficient: [0, 0] },
    });
    expect(tabulated.formulation).toBe("transverse-h");
    expect(tabulated.modes[0].effectiveIndex).toBeGreaterThan(benchmark.claddingIndex);
    expect(validateWaveguide({ ...benchmark, coreMaterial: "tabulated" }).join(" ")).toMatch(/incomplete/);
  }, 30_000);

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
    expect(sweep.points.every((point) => Number.isFinite(point.beta2Ps2PerKm))).toBe(true);
    expect(sweep.points.every((point) => Math.abs(point.beta2Ps2PerKm + (point.wavelengthUm * 1e-6) ** 2
      * point.dispersionPsPerNmKm * 1e21 / (2 * Math.PI * 299_792_458)) < 1e-10)).toBe(true);
    expect(Math.min(...sweep.points.map((point) => point.overlap))).toBeGreaterThan(0.7);
  });

  it("returns a complex effective index with stretched-coordinate PML", () => {
    const result = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1,
      boundary: "pml", pmlThicknessUm: 0.6, pmlStrength: 4,
    });
    expect(result.backend).toBe("Rust/WASM");
    const mode = result.modes[0];
    expect(mode.effectiveIndexImaginary).toBeGreaterThan(0);
    expect(mode.lossDbPerCm).toBeGreaterThan(0);
    expect(mode.modalPowerW).toBeCloseTo(NORMALIZED_MODAL_POWER_W, 8);
    expect(mode.residual).toBeLessThan(5e-3);
    expect(mode.pmlEnergyFraction).toBeGreaterThanOrEqual(0);
    expect(mode.pmlEnergyFraction).toBeLessThanOrEqual(1);
    expect(mode.boundaryEnergyFraction).toBeGreaterThanOrEqual(0);
  });

  it("projects straight modes onto PEC and PMC symmetry subspaces", () => {
    const full = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 4 });
    for (const symmetryX of ["pec", "pmc"] as const) {
      const symmetric = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, symmetryX });
      expect(symmetric.symmetryReductionFactor).toBeCloseTo(2, 1);
      expect(symmetric.modes).toHaveLength(1);
      expect(Math.min(...full.modes.map((mode) => Math.abs(mode.effectiveIndex - symmetric.modes[0].effectiveIndex)))).toBeLessThan(0.02);
      expect(Math.abs(symmetric.modes[0].symmetryX)).toBeGreaterThan(0.9);
    }
    const quarter = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, symmetryX: "pec", symmetryY: "pmc" });
    expect(quarter.symmetryReductionFactor).toBeCloseTo(4, 1);
    expect(quarter.modes).toHaveLength(1);
    expect(validateWaveguide({ ...benchmark, geometry: "rib", slabHeightUm: 0.1, symmetryY: "pec" }).join(" ")).toMatch(/vertically symmetric/);
    expect(validateWaveguide({ ...benchmark, bendRadiusUm: 10, symmetryX: "pmc" }).join(" ")).toMatch(/straight guides/);
  }, 20_000);

  it("applies reciprocal transverse Bloch-periodic boundaries", () => {
    const periodic = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicX: true, blochPhaseXRad: 0 });
    const positive = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicX: true, blochPhaseXRad: 0.45 });
    const negative = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicX: true, blochPhaseXRad: -0.45 });
    const positiveY = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicY: true, blochPhaseYRad: 0.35 });
    const negativeY = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicY: true, blochPhaseYRad: -0.35 });
    const openY = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicX: true, boundary: "pml", pmlThicknessUm: 0.6 });
    const periodicCell = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1, periodicX: true, periodicY: true });
    expect(periodic.backend).toBe("Rust/WASM");
    expect(periodic.modes).toHaveLength(1);
    expect(periodic.modes[0].effectiveIndexImaginary).toBeLessThan(1e-7);
    expect(positive.modes[0].effectiveIndex).toBeCloseTo(negative.modes[0].effectiveIndex, 6);
    expect(positiveY.modes[0].effectiveIndex).toBeCloseTo(negativeY.modes[0].effectiveIndex, 6);
    expect(positive.modes[0].modalPowerW).toBeCloseTo(NORMALIZED_MODAL_POWER_W, 8);
    expect(openY.modes).toHaveLength(1);
    expect(openY.modes[0].pmlEnergyFraction).toBeGreaterThanOrEqual(0);
    expect(periodicCell.modes).toHaveLength(1);
    expect(validateWaveguide({ ...benchmark, periodicX: true, blochPhaseXRad: Math.PI + 0.1 }).join(" ")).toMatch(/between −π and π/);
    expect(validateWaveguide({ ...benchmark, blochPhaseXRad: 0.2 }).join(" ")).toMatch(/requires the corresponding periodic boundary/);
    expect(validateWaveguide({ ...benchmark, periodicX: true, symmetryX: "pec" }).join(" ")).toMatch(/cannot be combined/);
    expect(validateWaveguide({ ...benchmark, periodicX: true, periodicY: true, boundary: "pml" }).join(" ")).toMatch(/at least one non-periodic/);
    expect(validateWaveguide({ ...benchmark, periodicY: true, geometry: "multilayer", substrateIndex: 1.44 }).join(" ")).toMatch(/matching top and bottom/);
  }, 20_000);

  it("recovers the straight-guide limit with the radial-transformed bend operator", () => {
    const straight = solveWaveguide({ ...benchmark, gridResolution: 24, modeCount: 1 }).modes[0];
    const bentResult = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1,
      bendRadiusUm: 100_000, bendDirection: "positive-x",
    });
    const bent = bentResult.modes[0];
    expect(bent).toBeDefined();
    expect(bentResult.formulation).toBe("transverse-e");
    expect(bentResult.backend).toBe("Rust/WASM");
    expect(bent.effectiveIndex).toBeCloseTo(straight.effectiveIndex, 2);
    expect(bent.modalPowerW).toBeCloseTo(NORMALIZED_MODAL_POWER_W, 8);
    expect(bent.residual).toBeLessThan(5e-3);
  }, 10_000);

  it("reverses the curved-mode displacement when the bend direction is reversed", () => {
    const positive = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1,
      bendRadiusUm: 10, bendDirection: "positive-x",
    });
    const negative = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1,
      bendRadiusUm: 10, bendDirection: "negative-x",
    });
    expect(positive.modes[0].effectiveIndex).toBeCloseTo(negative.modes[0].effectiveIndex, 2);
    const positiveCentroid = horizontalCentroid(positive.modes[0].fields.intensity, positive.xUm);
    const negativeCentroid = horizontalCentroid(negative.modes[0].fields.intensity, negative.xUm);
    expect(positiveCentroid).toBeCloseTo(-negativeCentroid, 2);
    expect(Math.abs(positiveCentroid)).toBeGreaterThan(1e-3);
  }, 10_000);

  it("retains a converged modal profile on a refined bend mesh", () => {
    const coarse = solveWaveguide({
      ...benchmark, gridResolution: 32, modeCount: 1,
      bendRadiusUm: 10, bendDirection: "positive-x",
    }).modes[0];
    const fine = solveWaveguide({
      ...benchmark, gridResolution: 48, modeCount: 1,
      bendRadiusUm: 10, bendDirection: "positive-x",
    }).modes[0];
    expect(fine).toBeDefined();
    expect(Math.abs(fine.effectiveIndex - coarse.effectiveIndex)).toBeLessThan(0.02);
    expect(fine.residual).toBeLessThan(5e-3);
    expect(fieldRoughness(fine.fields.Ex)).toBeLessThan(fieldRoughness(coarse.fields.Ex));
  }, 20_000);

  it("extracts bend radiation loss with a cylindrical stretched-coordinate PML", () => {
    const mode = solveWaveguide({
      ...benchmark, gridResolution: 24, modeCount: 1,
      bendRadiusUm: 10, bendDirection: "positive-x",
      boundary: "pml", pmlThicknessUm: 0.6, pmlStrength: 4,
    }).modes[0];
    expect(mode).toBeDefined();
    expect(mode.effectiveIndexImaginary).toBeGreaterThan(0);
    expect(mode.lossDbPerCm).toBeGreaterThan(0);
    expect(mode.modalPowerW).toBeCloseTo(NORMALIZED_MODAL_POWER_W, 8);
    expect(mode.residual).toBeLessThan(1e-2);
  }, 20_000);

  it("solves three bend modes on the 64-cell production mesh", () => {
    const result = solveWaveguide({
      ...benchmark, gridResolution: 64, modeCount: 3,
      bendRadiusUm: 10, bendDirection: "positive-x",
      boundary: "pml", pmlThicknessUm: 0.6, pmlStrength: 4,
    });
    expect(result.backend).toBe("Rust/WASM");
    expect(result.modes).toHaveLength(3);
    expect(Math.max(...result.modes.map((mode) => mode.residual))).toBeLessThan(1e-2);
  }, 20_000);

  it("tracks a mode through a geometry sweep", () => {
    const sweep = sweepGeometry({ ...benchmark, gridResolution: 24, modeCount: 2 }, {
      parameter: "widthUm", startValueUm: 0.9, stopValueUm: 1.1, points: 3, modeIndex: 0,
    });
    expect(sweep.points).toHaveLength(3);
    expect(Math.min(...sweep.points.map((point) => point.overlap))).toBeGreaterThan(0.7);
    expect(sweep.points.every((point) => point.degenerateSubspaceSize >= 1)).toBe(true);
  });

  it("builds a reciprocal transverse Bloch dispersion sweep", () => {
    const sweep = sweepBlochPhase({ ...benchmark, gridResolution: 24, modeCount: 2, periodicX: true }, {
      axis: "x", startPhaseRad: -0.3, stopPhaseRad: 0.3, points: 3, modeIndex: 0,
    });
    expect(sweep.points).toHaveLength(3);
    expect(sweep.points.every((point) => point.candidates.length > 0)).toBe(true);
    expect(sweep.reciprocityError).toBeLessThan(1e-5);
    expect(() => sweepBlochPhase(benchmark, { axis: "x", startPhaseRad: -0.3, stopPhaseRad: 0.3, points: 3, modeIndex: 0 })).toThrow(/periodic/);
  });
});
