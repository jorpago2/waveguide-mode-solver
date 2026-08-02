import { EigenvalueDecomposition, Matrix } from "ml-matrix";
import { evaluateMaterial, materialDefinition, type MaterialId } from "./materials";

export type FieldComponent = "Ex" | "Ey" | "Ez" | "Hx" | "Hy" | "Hz" | "intensity" | "poynting";
export type GeometryType = "channel" | "rib" | "slot" | "multilayer" | "coupler";
export type BoundaryType = "hard" | "pml";

export const PARAMETER_MAXIMUMS = {
  wavelengthUm: 1_000,
  dimensionUm: 1_000,
  refractiveIndex: 50,
  extinction: 10,
  dispersionPerUm: 1_000,
  gridResolution: 96,
  modeCount: 8,
  meshBias: 1.5,
  sweepPoints: 101,
} as const;

export interface WaveguideConfig {
  wavelengthUm: number;
  widthUm: number;
  heightUm: number;
  coreIndex: number;
  claddingIndex: number;
  paddingUm: number;
  gridResolution: number;
  modeCount: number;
  geometry?: GeometryType;
  slabHeightUm?: number;
  slotGapUm?: number;
  substrateIndex?: number;
  substrateIndexY?: number;
  substrateIndexZ?: number;
  coreIndexY?: number;
  coreIndexZ?: number;
  claddingIndexY?: number;
  claddingIndexZ?: number;
  coreExtinction?: number;
  claddingExtinction?: number;
  substrateExtinction?: number;
  coreDispersionPerUm?: number;
  claddingDispersionPerUm?: number;
  substrateDispersionPerUm?: number;
  materialReferenceWavelengthUm?: number;
  meshBias?: number;
  boundary?: BoundaryType;
  pmlThicknessUm?: number;
  pmlStrength?: number;
  coreMaterial?: MaterialId;
  claddingMaterial?: MaterialId;
  substrateMaterial?: MaterialId;
  couplerGapUm?: number;
  coreIndexOffset?: number;
}

export interface WaveguideMode {
  id: string;
  order: number;
  polarization: "quasi-TE" | "quasi-TM";
  effectiveIndex: number;
  effectiveIndexImaginary: number;
  propagationConstantPerUm: number;
  residual: number;
  electricConfinement: number;
  effectiveAreaUm2: number;
  longitudinalElectricFraction: number;
  xPolarizedElectricFraction: number;
  lossDbPerCm: number;
  modalPowerW: number;
  peakPoyntingWPerM2: number;
  fields: Record<FieldComponent, number[][]>;
}

export interface SolverResult {
  modes: WaveguideMode[];
  xUm: number[];
  yUm: number[];
  nx: number;
  ny: number;
  dxUm: number;
  dyUm: number;
  dxMaxUm: number;
  dyMaxUm: number;
  warnings: string[];
  arnoldiDimension: number;
}

export interface SweepSettings {
  startWavelengthUm: number;
  stopWavelengthUm: number;
  points: number;
  modeIndex: number;
}

export interface SweepPoint {
  wavelengthUm: number;
  effectiveIndex: number;
  groupIndex: number;
  dispersionPsPerNmKm: number;
  lossDbPerCm: number;
  overlap: number;
}

export interface SweepResult {
  points: SweepPoint[];
  warnings: string[];
}

export type GeometrySweepParameter = "widthUm" | "heightUm" | "slotGapUm" | "couplerGapUm";

export interface GeometrySweepSettings {
  parameter: GeometrySweepParameter;
  startValueUm: number;
  stopValueUm: number;
  points: number;
  modeIndex: number;
}

export interface GeometrySweepPoint {
  valueUm: number;
  effectiveIndex: number;
  electricConfinement: number;
  effectiveAreaUm2: number;
  lossDbPerCm: number;
  overlap: number;
}

export interface GeometrySweepResult {
  parameter: GeometrySweepParameter;
  points: GeometrySweepPoint[];
  warnings: string[];
}

interface Grid {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  dxCell: number[];
  dyCell: number[];
  dxDual: number[];
  dyDual: number[];
  x: number[];
  y: number[];
  epsilonCell: Float64Array;
  cellArea: Float64Array;
  coreFraction: Float64Array;
  extinctionCell: Float64Array;
  epsilonX: Float64Array;
  epsilonY: Float64Array;
  inverseEpsilonX: Float64Array;
  inverseEpsilonY: Float64Array;
  inverseEpsilonZ: Float64Array;
  epsilonXImaginary: Float64Array;
  epsilonYImaginary: Float64Array;
  inverseEpsilonXImaginary: Float64Array;
  inverseEpsilonYImaginary: Float64Array;
  inverseEpsilonZImaginary: Float64Array;
  inverseStretchXCellReal: Float64Array;
  inverseStretchXCellImaginary: Float64Array;
  inverseStretchXNodeReal: Float64Array;
  inverseStretchXNodeImaginary: Float64Array;
  inverseStretchYCellReal: Float64Array;
  inverseStretchYCellImaginary: Float64Array;
  inverseStretchYNodeReal: Float64Array;
  inverseStretchYNodeImaginary: Float64Array;
}

interface OperatorContext {
  grid: Grid;
  k0: number;
  hxSize: number;
  hySize: number;
  apply: (vector: Float64Array) => Float64Array;
  complex: boolean;
}

interface RitzPair {
  eigenvalue: number;
  eigenvalueImaginary: number;
  vector: Float64Array;
  vectorImaginary?: Float64Array;
  residual: number;
}

interface ComplexArray {
  real: Float64Array;
  imaginary: Float64Array;
}

export function validateWaveguide(config: WaveguideConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(config.wavelengthUm) || config.wavelengthUm < 0.2 || config.wavelengthUm > PARAMETER_MAXIMUMS.wavelengthUm) {
    errors.push(`Wavelength must be between 0.2 and ${PARAMETER_MAXIMUMS.wavelengthUm} µm.`);
  }
  if (!Number.isFinite(config.widthUm) || config.widthUm < 0.05 || config.widthUm > PARAMETER_MAXIMUMS.dimensionUm) {
    errors.push(`Core width must be between 0.05 and ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isFinite(config.heightUm) || config.heightUm < 0.05 || config.heightUm > PARAMETER_MAXIMUMS.dimensionUm) {
    errors.push(`Core height must be between 0.05 and ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isFinite(config.paddingUm) || config.paddingUm < 0.2 || config.paddingUm > PARAMETER_MAXIMUMS.dimensionUm) {
    errors.push(`Cladding padding must be between 0.2 and ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isFinite(config.claddingIndex) || config.claddingIndex < 1 || config.claddingIndex > PARAMETER_MAXIMUMS.refractiveIndex) {
    errors.push(`Cladding index must be between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if (!Number.isFinite(config.coreIndex) || config.coreIndex <= config.claddingIndex || config.coreIndex > PARAMETER_MAXIMUMS.refractiveIndex) {
    errors.push(`Core index must be greater than the cladding index and no larger than ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if (!Number.isInteger(config.gridResolution) || config.gridResolution < 24 || config.gridResolution > PARAMETER_MAXIMUMS.gridResolution) {
    errors.push(`Grid resolution must be an integer between 24 and ${PARAMETER_MAXIMUMS.gridResolution}.`);
  }
  if (!Number.isInteger(config.modeCount) || config.modeCount < 1 || config.modeCount > PARAMETER_MAXIMUMS.modeCount) {
    errors.push(`Requested modes must be an integer between 1 and ${PARAMETER_MAXIMUMS.modeCount}.`);
  }
  const finiteOptional = [
    config.coreIndexY, config.coreIndexZ, config.claddingIndexY, config.claddingIndexZ,
    config.coreExtinction, config.claddingExtinction, config.substrateIndex, config.substrateIndexY, config.substrateIndexZ,
    config.substrateExtinction, config.coreDispersionPerUm, config.claddingDispersionPerUm,
    config.substrateDispersionPerUm, config.meshBias, config.coreIndexOffset,
  ].every((value) => value === undefined || Number.isFinite(value));
  if (!finiteOptional) errors.push("Optional material and mesh values must be finite.");
  if ([config.coreExtinction ?? 0, config.claddingExtinction ?? 0, config.substrateExtinction ?? 0]
    .some((value) => value < 0 || value > PARAMETER_MAXIMUMS.extinction)) {
    errors.push(`Extinction coefficients must be between 0 and ${PARAMETER_MAXIMUMS.extinction}.`);
  }
  if ([config.coreDispersionPerUm ?? 0, config.claddingDispersionPerUm ?? 0, config.substrateDispersionPerUm ?? 0]
    .some((value) => Math.abs(value) > PARAMETER_MAXIMUMS.dispersionPerUm)) {
    errors.push(`Material dispersion slopes must stay within ±${PARAMETER_MAXIMUMS.dispersionPerUm} µm⁻¹.`);
  }
  if ((config.materialReferenceWavelengthUm ?? config.wavelengthUm) < 0.2
    || (config.materialReferenceWavelengthUm ?? config.wavelengthUm) > PARAMETER_MAXIMUMS.wavelengthUm) {
    errors.push(`Material reference wavelength must be between 0.2 and ${PARAMETER_MAXIMUMS.wavelengthUm} µm.`);
  }
  if ((config.meshBias ?? 0) < 0 || (config.meshBias ?? 0) > PARAMETER_MAXIMUMS.meshBias) errors.push(`Mesh bias must be between 0 and ${PARAMETER_MAXIMUMS.meshBias}.`);
  if ((config.boundary ?? "hard") === "pml") {
    const thickness = config.pmlThicknessUm ?? config.paddingUm * 0.6;
    if (!(thickness > 0 && thickness < config.paddingUm)) errors.push("PML thickness must be positive and smaller than the cladding padding.");
    if (!Number.isFinite(config.pmlStrength ?? 4) || (config.pmlStrength ?? 4) <= 0 || (config.pmlStrength ?? 4) > 50) errors.push("PML strength must be between 0 and 50.");
  }
  if ((config.geometry ?? "channel") === "rib" && ((config.slabHeightUm ?? 0) <= 0 || (config.slabHeightUm ?? 0) >= config.heightUm)) {
    errors.push("Rib slab height must be positive and smaller than the total core height.");
  }
  if ((config.geometry ?? "channel") === "slot" && ((config.slotGapUm ?? 0) <= 0 || (config.slotGapUm ?? 0) >= config.widthUm)) {
    errors.push("Slot gap must be positive and smaller than the total core width.");
  }
  if ((config.geometry ?? "channel") === "coupler" && (!Number.isFinite(config.couplerGapUm) || (config.couplerGapUm ?? 0) <= 0 || (config.couplerGapUm ?? 0) > PARAMETER_MAXIMUMS.dimensionUm)) {
    errors.push(`Coupler gap must be positive and no larger than ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if ((config.geometry ?? "channel") === "multilayer" && ((config.substrateIndex ?? 0) < 1 || (config.substrateIndex ?? 0) > PARAMETER_MAXIMUMS.refractiveIndex)) {
    errors.push(`Substrate index must be between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  let materialModelsValid = true;
  const selectedMaterialIds = new Set([config.coreMaterial, config.claddingMaterial,
    ...((config.geometry ?? "channel") === "multilayer" ? [config.substrateMaterial] : [])]);
  for (const materialId of selectedMaterialIds) {
    if (materialId && materialId !== "custom") {
      const material = materialDefinition(materialId);
      if (config.wavelengthUm < material.minimumWavelengthUm || config.wavelengthUm > material.maximumWavelengthUm) {
        errors.push(`${material.name} is valid from ${material.minimumWavelengthUm} to ${material.maximumWavelengthUm} µm.`);
        materialModelsValid = false;
      }
    }
  }
  if (finiteOptional && materialModelsValid) {
    const materials = materialValues(config);
    const indices = Object.values(materials).flatMap((material) => [material.nx, material.ny, material.nz]);
    if (indices.some((value) => value < 1 || value > PARAMETER_MAXIMUMS.refractiveIndex)) errors.push(`Dispersive material indices must remain between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex} at the solved wavelength.`);
    const coreMaximum = Math.max(materials.core.nx, materials.core.ny, materials.core.nz);
    const exteriorMaximum = Math.max(materials.cladding.nx, materials.cladding.ny, materials.cladding.nz,
      (config.geometry ?? "channel") === "multilayer" ? materials.substrate.nx : 0);
    if (coreMaximum <= exteriorMaximum) errors.push("The core must retain a larger principal index than the exterior materials.");
  }
  return errors;
}

export function solveWaveguide(config: WaveguideConfig): SolverResult {
  const errors = validateWaveguide(config);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const grid = createGrid(config);
  const operator = createVectorOperator(grid, config.wavelengthUm);
  const requestedRitzPairs = Math.max(config.modeCount * 3, 8);
  const arnoldiDimension = Math.min(
    (operator.hxSize + operator.hySize) * (operator.complex ? 2 : 1) - 1,
    Math.max(operator.complex ? 24 : 16, config.modeCount * (operator.complex ? 10 : 6)),
  );
  const pairs = solveLargestEigenpairs(operator, arnoldiDimension, requestedRitzPairs, config);
  const { exteriorIndex, maximumIndex } = guidanceBounds(config);
  const guidedPairs = pairs.filter((pair) => {
    const effectiveIndex = Math.sqrt(Math.max(0, pair.eigenvalue)) / operator.k0;
    return effectiveIndex > exteriorIndex + 1e-5 && effectiveIndex < maximumIndex * 1.01;
  });
  const uniquePairs = guidedPairs.filter((pair, index, all) => {
    const effectiveIndex = Math.sqrt(pair.eigenvalue) / operator.k0;
    return all.findIndex((candidate) => (
      Math.abs(Math.sqrt(candidate.eigenvalue) / operator.k0 - effectiveIndex) < 1e-7
    )) === index;
  });
  const convergedPairs = uniquePairs.filter((pair) => pair.residual <= 2e-2);
  const modes = convergedPairs
    .slice(0, config.modeCount)
    .map((pair, index) => buildMode(pair, index, config, operator));

  const warnings: string[] = [];
  const cellsAcrossCore = Math.min(
    grid.x.filter((value) => Math.abs(value) <= config.widthUm / 2).length,
    grid.y.filter((value) => Math.abs(value) <= config.heightUm / 2).length,
  );
  if (cellsAcrossCore < 8) warnings.push("Fewer than 8 cells span the smallest core dimension; refine the grid before using quantitative values.");
  if (convergedPairs.length < uniquePairs.length) warnings.push(`${uniquePairs.length - convergedPairs.length} poorly converged mode${uniquePairs.length - convergedPairs.length === 1 ? " was" : "s were"} discarded because the field residual exceeded 2 × 10⁻².`);
  if (modes.length < config.modeCount) warnings.push(`Only ${modes.length} guided mode${modes.length === 1 ? " was" : "s were"} found inside the requested index interval.`);
  if (modes.some((mode) => mode.residual > 2e-3)) warnings.push("One or more eigenpairs need review; reduce the requested mode count or mesh bias before interpreting the field profile.");

  return {
    modes,
    xUm: grid.x,
    yUm: grid.y,
    nx: grid.nx,
    ny: grid.ny,
    dxUm: grid.dx,
    dyUm: grid.dy,
    dxMaxUm: Math.max(...grid.dxCell),
    dyMaxUm: Math.max(...grid.dyCell),
    warnings,
    arnoldiDimension,
  };
}

export function sweepWaveguide(config: WaveguideConfig, settings: SweepSettings): SweepResult {
  if (!(settings.startWavelengthUm >= 0.2 && settings.stopWavelengthUm <= PARAMETER_MAXIMUMS.wavelengthUm && settings.stopWavelengthUm > settings.startWavelengthUm)) {
    throw new Error(`Sweep limits must be ordered and stay between 0.2 and ${PARAMETER_MAXIMUMS.wavelengthUm} µm.`);
  }
  if (!Number.isInteger(settings.points) || settings.points < 5 || settings.points > PARAMETER_MAXIMUMS.sweepPoints) {
    throw new Error(`Sweep points must be an integer between 5 and ${PARAMETER_MAXIMUMS.sweepPoints}.`);
  }
  const wavelengths = Array.from({ length: settings.points }, (_, index) => (
    settings.startWavelengthUm + index * (settings.stopWavelengthUm - settings.startWavelengthUm) / (settings.points - 1)
  ));
  const anchor = wavelengths.reduce((best, value, index) => (
    Math.abs(value - config.wavelengthUm) < Math.abs(wavelengths[best] - config.wavelengthUm) ? index : best
  ), 0);
  const tracked: Array<{ mode: WaveguideMode; overlap: number } | undefined> = new Array(settings.points);
  const solveAt = (index: number) => solveWaveguide({ ...config, wavelengthUm: wavelengths[index] }).modes;
  const anchorModes = solveAt(anchor);
  if (anchorModes.length === 0) throw new Error("No guided mode exists at the sweep anchor wavelength.");
  tracked[anchor] = { mode: anchorModes[Math.min(settings.modeIndex, anchorModes.length - 1)], overlap: 1 };

  for (const direction of [1, -1]) {
    for (let index = anchor + direction; index >= 0 && index < wavelengths.length; index += direction) {
      const previous = tracked[index - direction]?.mode;
      const candidates = solveAt(index);
      if (!previous || candidates.length === 0) break;
      const ranked = candidates.map((mode) => ({ mode, overlap: modeOverlap(previous, mode) }))
        .sort((first, second) => second.overlap - first.overlap);
      tracked[index] = ranked[0];
    }
  }

  const valid = tracked.map((entry, index) => entry && ({ wavelengthUm: wavelengths[index], ...entry })).filter(Boolean) as Array<{
    wavelengthUm: number; mode: WaveguideMode; overlap: number;
  }>;
  if (valid.length < 5) throw new Error("The selected mode could not be tracked across at least five wavelengths.");
  const lambda = valid.map((entry) => entry.wavelengthUm);
  const neff = valid.map((entry) => entry.mode.effectiveIndex);
  const first = derivative(lambda, neff);
  const second = secondDerivative(lambda, neff);
  const speedOfLight = 299_792_458;
  const points = valid.map((entry, index) => ({
    wavelengthUm: entry.wavelengthUm,
    effectiveIndex: entry.mode.effectiveIndex,
    groupIndex: entry.mode.effectiveIndex - entry.wavelengthUm * first[index],
    dispersionPsPerNmKm: -(entry.wavelengthUm * 1e12 / speedOfLight) * second[index],
    lossDbPerCm: entry.mode.lossDbPerCm,
    overlap: entry.overlap,
  }));
  const warnings: string[] = [];
  if (valid.length < settings.points) warnings.push(`Mode tracking stopped at ${valid.length} of ${settings.points} wavelengths.`);
  if (points.some((point) => point.overlap < 0.75)) warnings.push("A low field overlap indicates a possible mode crossing; inspect that interval.");
  warnings.push("Group index and dispersion use finite differences; repeat with more wavelength points to check convergence.");
  return { points, warnings };
}

export function sweepGeometry(config: WaveguideConfig, settings: GeometrySweepSettings): GeometrySweepResult {
  if (!(settings.startValueUm > 0 && settings.stopValueUm > settings.startValueUm && settings.stopValueUm <= PARAMETER_MAXIMUMS.dimensionUm)) {
    throw new Error(`Geometry sweep limits must be positive, ordered and no larger than ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isInteger(settings.points) || settings.points < 3 || settings.points > PARAMETER_MAXIMUMS.sweepPoints) {
    throw new Error(`Geometry sweep points must be an integer between 3 and ${PARAMETER_MAXIMUMS.sweepPoints}.`);
  }
  if (settings.parameter === "slotGapUm" && (config.geometry ?? "channel") !== "slot") {
    throw new Error("Slot-gap sweeps require the slot geometry.");
  }
  if (settings.parameter === "couplerGapUm" && (config.geometry ?? "channel") !== "coupler") {
    throw new Error("Coupler-gap sweeps require the coupler geometry.");
  }
  const currentValue = settings.parameter === "slotGapUm" ? (config.slotGapUm ?? config.widthUm / 5)
    : settings.parameter === "couplerGapUm" ? (config.couplerGapUm ?? config.widthUm / 2)
    : config[settings.parameter];
  const values = Array.from({ length: settings.points }, (_, index) => (
    settings.startValueUm + index * (settings.stopValueUm - settings.startValueUm) / (settings.points - 1)
  ));
  const anchor = values.reduce((best, value, index) => (
    Math.abs(value - currentValue) < Math.abs(values[best] - currentValue) ? index : best
  ), 0);
  const tracked: Array<{ result: SolverResult; mode: WaveguideMode; overlap: number } | undefined> = new Array(settings.points);
  const solveAt = (index: number) => {
    const nextConfig = { ...config, [settings.parameter]: values[index] };
    const errors = validateWaveguide(nextConfig);
    if (errors.length > 0) return undefined;
    return solveWaveguide(nextConfig);
  };
  const anchorResult = solveAt(anchor);
  if (!anchorResult?.modes.length) throw new Error("No guided mode exists at the geometry-sweep anchor.");
  tracked[anchor] = {
    result: anchorResult,
    mode: anchorResult.modes[Math.min(settings.modeIndex, anchorResult.modes.length - 1)],
    overlap: 1,
  };

  for (const direction of [1, -1]) {
    for (let index = anchor + direction; index >= 0 && index < values.length; index += direction) {
      const previous = tracked[index - direction];
      const candidateResult = solveAt(index);
      if (!previous || !candidateResult?.modes.length) break;
      const ranked = candidateResult.modes.map((mode) => ({
        result: candidateResult,
        mode,
        overlap: resampledModeOverlap(previous.result, previous.mode, candidateResult, mode),
      })).sort((first, second) => second.overlap - first.overlap);
      tracked[index] = ranked[0];
    }
  }

  const points = tracked.map((entry, index) => entry && ({
    valueUm: values[index],
    effectiveIndex: entry.mode.effectiveIndex,
    electricConfinement: entry.mode.electricConfinement,
    effectiveAreaUm2: entry.mode.effectiveAreaUm2,
    lossDbPerCm: entry.mode.lossDbPerCm,
    overlap: entry.overlap,
  })).filter(Boolean) as GeometrySweepPoint[];
  if (points.length < 3) throw new Error("The selected mode could not be tracked across at least three geometry values.");
  const warnings: string[] = [];
  if (points.length < settings.points) warnings.push(`Mode tracking stopped at ${points.length} of ${settings.points} geometry values.`);
  if (points.some((point) => point.overlap < 0.75)) warnings.push("A low field overlap indicates a possible mode crossing; inspect that interval.");
  return { parameter: settings.parameter, points, warnings };
}

function materialValues(config: WaveguideConfig) {
  const reference = config.materialReferenceWavelengthUm ?? config.wavelengthUm;
  const offset = config.wavelengthUm - reference;
  const values = (materialId: MaterialId | undefined, base: number, ny: number | undefined, nz: number | undefined, k: number | undefined, slope: number | undefined, indexOffset = 0) => ({
    nx: (materialId && materialId !== "custom" ? evaluateMaterial(materialId, config.wavelengthUm) : base + (slope ?? 0) * offset) + indexOffset,
    ny: (materialId && materialId !== "custom" ? evaluateMaterial(materialId, config.wavelengthUm) : (ny ?? base) + (slope ?? 0) * offset) + indexOffset,
    nz: (materialId && materialId !== "custom" ? evaluateMaterial(materialId, config.wavelengthUm) : (nz ?? base) + (slope ?? 0) * offset) + indexOffset,
    k: k ?? 0,
  });
  return {
    core: values(config.coreMaterial, config.coreIndex, config.coreIndexY, config.coreIndexZ, config.coreExtinction, config.coreDispersionPerUm, config.coreIndexOffset ?? 0),
    cladding: values(config.claddingMaterial, config.claddingIndex, config.claddingIndexY, config.claddingIndexZ, config.claddingExtinction, config.claddingDispersionPerUm),
    substrate: values(config.substrateMaterial, config.substrateIndex ?? config.claddingIndex, config.substrateIndexY, config.substrateIndexZ, config.substrateExtinction, config.substrateDispersionPerUm),
  };
}

function guidanceBounds(config: WaveguideConfig): { exteriorIndex: number; maximumIndex: number } {
  const values = materialValues(config);
  const maximum = (material: { nx: number; ny: number; nz: number }) => Math.max(material.nx, material.ny, material.nz);
  return {
    exteriorIndex: Math.max(maximum(values.cladding), (config.geometry ?? "channel") === "multilayer" ? maximum(values.substrate) : 0),
    maximumIndex: Math.max(maximum(values.core), maximum(values.cladding), maximum(values.substrate)),
  };
}

function regionFractions(x0: number, x1: number, y0: number, y1: number, config: WaveguideConfig): { core: number; substrate: number } {
  const geometry = config.geometry ?? "channel";
  const coreBottom = -config.heightUm / 2;
  const coreTop = config.heightUm / 2;
  let core = 0;
  if (geometry === "rib") {
    const slabTop = coreBottom + (config.slabHeightUm ?? config.heightUm / 2);
    core = rectangleFraction(x0, x1, y0, y1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, coreBottom, slabTop)
      + rectangleFraction(x0, x1, y0, y1, -config.widthUm / 2, config.widthUm / 2, slabTop, coreTop);
  } else if (geometry === "slot") {
    const gap = config.slotGapUm ?? config.widthUm / 5;
    core = rectangleFraction(x0, x1, y0, y1, -config.widthUm / 2, -gap / 2, coreBottom, coreTop)
      + rectangleFraction(x0, x1, y0, y1, gap / 2, config.widthUm / 2, coreBottom, coreTop);
  } else if (geometry === "coupler") {
    const gap = config.couplerGapUm ?? config.widthUm / 2;
    core = rectangleFraction(x0, x1, y0, y1, -gap / 2 - config.widthUm, -gap / 2, coreBottom, coreTop)
      + rectangleFraction(x0, x1, y0, y1, gap / 2, gap / 2 + config.widthUm, coreBottom, coreTop);
  } else {
    core = rectangleFraction(x0, x1, y0, y1, -config.widthUm / 2, config.widthUm / 2, coreBottom, coreTop);
  }
  const substrate = geometry === "multilayer"
    ? rectangleFraction(x0, x1, y0, y1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, coreBottom)
    : 0;
  return { core: clamp(core, 0, 1), substrate: clamp(substrate, 0, 1) };
}

function rectangleFraction(
  x0: number, x1: number, y0: number, y1: number,
  rectangleX0: number, rectangleX1: number, rectangleY0: number, rectangleY1: number,
): number {
  const overlapX = Math.max(0, Math.min(x1, rectangleX1) - Math.max(x0, rectangleX0));
  const overlapY = Math.max(0, Math.min(y1, rectangleY1) - Math.max(y0, rectangleY0));
  return overlapX * overlapY / ((x1 - x0) * (y1 - y0));
}

function stretchedEdges(length: number, cells: number, bias: number): number[] {
  if (bias < 1e-9) return Array.from({ length: cells + 1 }, (_, index) => -length / 2 + index * length / cells);
  const denominator = Math.sinh(bias);
  return Array.from({ length: cells + 1 }, (_, index) => {
    const coordinate = -1 + 2 * index / cells;
    return (length / 2) * Math.sinh(bias * coordinate) / denominator;
  });
}

function differences(values: number[]): number[] {
  return values.slice(1).map((value, index) => value - values[index]);
}

function dualSpacing(cellSpacing: number[]): number[] {
  return Array.from({ length: cellSpacing.length + 1 }, (_, index) => {
    if (index === 0) return cellSpacing[0];
    if (index === cellSpacing.length) return cellSpacing[cellSpacing.length - 1];
    return (cellSpacing[index - 1] + cellSpacing[index]) / 2;
  });
}

function modeOverlap(first: WaveguideMode, second: WaveguideMode): number {
  let numerator = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (const component of ["Ex", "Ey", "Ez"] as const) {
    for (let row = 0; row < first.fields[component].length; row += 1) {
      for (let column = 0; column < first.fields[component][row].length; column += 1) {
        const a = first.fields[component][row][column];
        const b = second.fields[component][row][column];
        numerator += a * b;
        firstNorm += a * a;
        secondNorm += b * b;
      }
    }
  }
  return Math.abs(numerator) / Math.sqrt(Math.max(firstNorm * secondNorm, 1e-30));
}

export function resampledModeOverlap(
  firstResult: SolverResult,
  first: WaveguideMode,
  secondResult: SolverResult,
  second: WaveguideMode,
): number {
  let numerator = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (const component of ["Ex", "Ey", "Ez"] as const) {
    for (let row = 0; row < firstResult.yUm.length; row += 1) {
      for (let column = 0; column < firstResult.xUm.length; column += 1) {
        const a = first.fields[component][row][column];
        const b = bilinearSample(second.fields[component], secondResult.xUm, secondResult.yUm,
          firstResult.xUm[column], firstResult.yUm[row]);
        if (b === undefined) continue;
        numerator += a * b;
        firstNorm += a * a;
        secondNorm += b * b;
      }
    }
  }
  return Math.abs(numerator) / Math.sqrt(Math.max(firstNorm * secondNorm, 1e-30));
}

function bilinearSample(field: number[][], x: number[], y: number[], sampleX: number, sampleY: number): number | undefined {
  const column = lowerIndex(x, sampleX);
  const row = lowerIndex(y, sampleY);
  if (column < 0 || row < 0 || column + 1 >= x.length || row + 1 >= y.length) return undefined;
  const tx = (sampleX - x[column]) / (x[column + 1] - x[column]);
  const ty = (sampleY - y[row]) / (y[row + 1] - y[row]);
  const lower = field[row][column] * (1 - tx) + field[row][column + 1] * tx;
  const upper = field[row + 1][column] * (1 - tx) + field[row + 1][column + 1] * tx;
  return lower * (1 - ty) + upper * ty;
}

function lowerIndex(values: number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle - 1;
  }
  return high;
}

function derivative(x: number[], y: number[]): number[] {
  return y.map((_, index) => {
    if (index === 0) return (y[1] - y[0]) / (x[1] - x[0]);
    if (index === y.length - 1) return (y[index] - y[index - 1]) / (x[index] - x[index - 1]);
    return (y[index + 1] - y[index - 1]) / (x[index + 1] - x[index - 1]);
  });
}

function secondDerivative(x: number[], y: number[]): number[] {
  const first = derivative(x, y);
  return derivative(x, first);
}

function createGrid(config: WaveguideConfig): Grid {
  const coreSpan = (config.geometry ?? "channel") === "coupler" ? 2 * config.widthUm + (config.couplerGapUm ?? config.widthUm / 2) : config.widthUm;
  const domainWidth = coreSpan + 2 * config.paddingUm;
  const domainHeight = config.heightUm + 2 * config.paddingUm;
  const nominalStep = Math.max(domainWidth, domainHeight) / config.gridResolution;
  const nx = Math.max(12, Math.round(domainWidth / nominalStep));
  const ny = Math.max(12, Math.round(domainHeight / nominalStep));
  const xEdges = stretchedEdges(domainWidth, nx, config.meshBias ?? 0);
  const yEdges = stretchedEdges(domainHeight, ny, config.meshBias ?? 0);
  const dxCell = differences(xEdges);
  const dyCell = differences(yEdges);
  const dxDual = dualSpacing(dxCell);
  const dyDual = dualSpacing(dyCell);
  const x = dxCell.map((_, index) => (xEdges[index] + xEdges[index + 1]) / 2);
  const y = dyCell.map((_, index) => (yEdges[index] + yEdges[index + 1]) / 2);
  const dx = Math.min(...dxCell);
  const dy = Math.min(...dyCell);
  const epsilonCellX = new Float64Array(nx * ny);
  const epsilonCellY = new Float64Array(nx * ny);
  const epsilonCellZ = new Float64Array(nx * ny);
  const epsilonCellXImaginary = new Float64Array(nx * ny);
  const epsilonCellYImaginary = new Float64Array(nx * ny);
  const epsilonCellZImaginary = new Float64Array(nx * ny);
  const epsilonCell = new Float64Array(nx * ny);
  const extinctionCell = new Float64Array(nx * ny);
  const cellArea = new Float64Array(nx * ny);
  const coreFraction = new Float64Array(nx * ny);
  const material = materialValues(config);

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cellIndex(row, column, nx);
      const fractions = regionFractions(xEdges[column], xEdges[column + 1], yEdges[row], yEdges[row + 1], config);
      const claddingFraction = Math.max(0, 1 - fractions.core - fractions.substrate);
      coreFraction[index] = fractions.core;
      epsilonCellX[index] = fractions.core * (material.core.nx ** 2 - material.core.k ** 2) + fractions.substrate * (material.substrate.nx ** 2 - material.substrate.k ** 2) + claddingFraction * (material.cladding.nx ** 2 - material.cladding.k ** 2);
      epsilonCellY[index] = fractions.core * (material.core.ny ** 2 - material.core.k ** 2) + fractions.substrate * (material.substrate.ny ** 2 - material.substrate.k ** 2) + claddingFraction * (material.cladding.ny ** 2 - material.cladding.k ** 2);
      epsilonCellZ[index] = fractions.core * (material.core.nz ** 2 - material.core.k ** 2) + fractions.substrate * (material.substrate.nz ** 2 - material.substrate.k ** 2) + claddingFraction * (material.cladding.nz ** 2 - material.cladding.k ** 2);
      epsilonCellXImaginary[index] = 2 * (fractions.core * material.core.nx * material.core.k + fractions.substrate * material.substrate.nx * material.substrate.k + claddingFraction * material.cladding.nx * material.cladding.k);
      epsilonCellYImaginary[index] = 2 * (fractions.core * material.core.ny * material.core.k + fractions.substrate * material.substrate.ny * material.substrate.k + claddingFraction * material.cladding.ny * material.cladding.k);
      epsilonCellZImaginary[index] = 2 * (fractions.core * material.core.nz * material.core.k + fractions.substrate * material.substrate.nz * material.substrate.k + claddingFraction * material.cladding.nz * material.cladding.k);
      epsilonCell[index] = (epsilonCellX[index] + epsilonCellY[index] + epsilonCellZ[index]) / 3;
      extinctionCell[index] = fractions.core * material.core.k + fractions.substrate * material.substrate.k + claddingFraction * material.cladding.k;
      cellArea[index] = dxCell[column] * dyCell[row];
    }
  }

  const epsilonX = new Float64Array((ny + 1) * nx);
  const epsilonXImaginary = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = epsilonCellX[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)];
      const north = epsilonCellX[cellIndex(clamp(row, 0, ny - 1), column, nx)];
      epsilonX[row * nx + column] = (south + north) / 2;
      epsilonXImaginary[row * nx + column] = (epsilonCellXImaginary[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)] + epsilonCellXImaginary[cellIndex(clamp(row, 0, ny - 1), column, nx)]) / 2;
    }
  }

  const epsilonY = new Float64Array(ny * (nx + 1));
  const epsilonYImaginary = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = epsilonCellY[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)];
      const east = epsilonCellY[cellIndex(row, clamp(column, 0, nx - 1), nx)];
      epsilonY[row * (nx + 1) + column] = (west + east) / 2;
      epsilonYImaginary[row * (nx + 1) + column] = (epsilonCellYImaginary[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)] + epsilonCellYImaginary[cellIndex(row, clamp(column, 0, nx - 1), nx)]) / 2;
    }
  }

  const inverseEpsilonZ = new Float64Array((ny + 1) * (nx + 1));
  const inverseEpsilonZImaginary = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = clamp(row - 1, 0, ny - 1);
      const north = clamp(row, 0, ny - 1);
      const west = clamp(column - 1, 0, nx - 1);
      const east = clamp(column, 0, nx - 1);
      const average = (
        epsilonCellZ[cellIndex(south, west, nx)]
        + epsilonCellZ[cellIndex(south, east, nx)]
        + epsilonCellZ[cellIndex(north, west, nx)]
        + epsilonCellZ[cellIndex(north, east, nx)]
      ) / 4;
      const averageImaginary = (
        epsilonCellZImaginary[cellIndex(south, west, nx)]
        + epsilonCellZImaginary[cellIndex(south, east, nx)]
        + epsilonCellZImaginary[cellIndex(north, west, nx)]
        + epsilonCellZImaginary[cellIndex(north, east, nx)]
      ) / 4;
      const denominator = average ** 2 + averageImaginary ** 2;
      inverseEpsilonZ[row * (nx + 1) + column] = average / denominator;
      inverseEpsilonZImaginary[row * (nx + 1) + column] = -averageImaginary / denominator;
    }
  }

  const inverseEpsilonX = complexReciprocal(epsilonX, epsilonXImaginary);
  const inverseEpsilonY = complexReciprocal(epsilonY, epsilonYImaginary);
  const pmlThickness = (config.boundary ?? "hard") === "pml" ? (config.pmlThicknessUm ?? config.paddingUm * 0.6) : 0;
  const pmlStrength = config.pmlStrength ?? 4;
  const xCellStretch = stretchProfile(x, domainWidth / 2, pmlThickness, pmlStrength);
  const yCellStretch = stretchProfile(y, domainHeight / 2, pmlThickness, pmlStrength);
  const xNodeStretch = stretchProfile(xEdges, domainWidth / 2, pmlThickness, pmlStrength);
  const yNodeStretch = stretchProfile(yEdges, domainHeight / 2, pmlThickness, pmlStrength);

  return {
    nx,
    ny,
    dx,
    dy,
    dxCell,
    dyCell,
    dxDual,
    dyDual,
    x,
    y,
    epsilonCell,
    cellArea,
    coreFraction,
    extinctionCell,
    epsilonX,
    epsilonY,
    inverseEpsilonX: inverseEpsilonX.real,
    inverseEpsilonY: inverseEpsilonY.real,
    inverseEpsilonZ,
    epsilonXImaginary,
    epsilonYImaginary,
    inverseEpsilonXImaginary: inverseEpsilonX.imaginary,
    inverseEpsilonYImaginary: inverseEpsilonY.imaginary,
    inverseEpsilonZImaginary,
    inverseStretchXCellReal: xCellStretch.real,
    inverseStretchXCellImaginary: xCellStretch.imaginary,
    inverseStretchXNodeReal: xNodeStretch.real,
    inverseStretchXNodeImaginary: xNodeStretch.imaginary,
    inverseStretchYCellReal: yCellStretch.real,
    inverseStretchYCellImaginary: yCellStretch.imaginary,
    inverseStretchYNodeReal: yNodeStretch.real,
    inverseStretchYNodeImaginary: yNodeStretch.imaginary,
  };
}

function complexReciprocal(real: Float64Array, imaginary: Float64Array): { real: Float64Array; imaginary: Float64Array } {
  const outputReal = new Float64Array(real.length);
  const outputImaginary = new Float64Array(real.length);
  for (let index = 0; index < real.length; index += 1) {
    const denominator = real[index] ** 2 + imaginary[index] ** 2;
    outputReal[index] = real[index] / denominator;
    outputImaginary[index] = -imaginary[index] / denominator;
  }
  return { real: outputReal, imaginary: outputImaginary };
}

function stretchProfile(coordinates: number[], halfDomain: number, thickness: number, strength: number): { real: Float64Array; imaginary: Float64Array } {
  const real = new Float64Array(coordinates.length).fill(1);
  const imaginary = new Float64Array(coordinates.length);
  if (thickness <= 0) return { real, imaginary };
  for (let index = 0; index < coordinates.length; index += 1) {
    const depth = Math.max(0, Math.abs(coordinates[index]) - (halfDomain - thickness)) / thickness;
    const damping = strength * depth ** 3;
    const denominator = 1 + damping ** 2;
    real[index] = 1 / denominator;
    imaginary[index] = -damping / denominator;
  }
  return { real, imaginary };
}

function createVectorOperator(grid: Grid, wavelengthUm: number): OperatorContext {
  const { nx, ny, dxCell, dyCell, dxDual, dyDual, epsilonX, epsilonY, inverseEpsilonZ } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const k0 = (2 * Math.PI) / wavelengthUm;
  const inverseK0Squared = 1 / k0 ** 2;

  const applyReal = (vector: Float64Array): Float64Array => {
    const hx = vector.subarray(0, hxSize);
    const hy = vector.subarray(hxSize);
    const transverseDivergence = add(bx(hx, nx, ny, dxCell), by(hy, nx, ny, dyCell));
    const longitudinalCurl = subtract(dyOperator(hx, nx, ny, dyDual), dxOperator(hy, nx, ny, dxDual));
    multiplyInPlace(longitudinalCurl, inverseEpsilonZ);
    const correction = subtract(
      bx(ay(longitudinalCurl, nx, ny, dyCell), nx, ny, dxCell),
      by(ax(longitudinalCurl, nx, ny, dxCell), nx, ny, dyCell),
    );
    addScaledInPlace(transverseDivergence, correction, inverseK0Squared);

    const outputHx = cx(transverseDivergence, nx, ny, dxDual);
    const outputHy = cy(transverseDivergence, nx, ny, dyDual);
    addScaledInPlace(outputHx, ay(longitudinalCurl, nx, ny, dyCell), 1, epsilonY);
    addScaledInPlace(outputHy, ax(longitudinalCurl, nx, ny, dxCell), -1, epsilonX);
    addScaledInPlace(outputHx, hx, k0 ** 2, epsilonY);
    addScaledInPlace(outputHy, hy, k0 ** 2, epsilonX);

    const output = new Float64Array(hxSize + hySize);
    output.set(outputHx, 0);
    output.set(outputHy, hxSize);
    return output;
  };
  const complex = grid.epsilonXImaginary.some((value) => value !== 0)
    || grid.epsilonYImaginary.some((value) => value !== 0)
    || grid.inverseStretchXCellImaginary.some((value) => value !== 0)
    || grid.inverseStretchYCellImaginary.some((value) => value !== 0);
  const apply = complex ? (vector: Float64Array): Float64Array => {
    const vectorSize = hxSize + hySize;
    const hx = complexSlice(vector, 0, hxSize, vectorSize);
    const hy = complexSlice(vector, hxSize, vectorSize, vectorSize);
    const transverseDivergence = complexAdd(
      complexBx(hx, grid), complexBy(hy, grid),
    );
    const longitudinalCurl = complexSubtract(
      complexDyOperator(hx, grid), complexDxOperator(hy, grid),
    );
    complexMultiplyInPlace(longitudinalCurl, grid.inverseEpsilonZ, grid.inverseEpsilonZImaginary);
    const correction = complexSubtract(
      complexBx(complexAy(longitudinalCurl, grid), grid),
      complexBy(complexAx(longitudinalCurl, grid), grid),
    );
    complexAddScaledInPlace(transverseDivergence, correction, inverseK0Squared);
    const outputHx = complexCx(transverseDivergence, grid);
    const outputHy = complexCy(transverseDivergence, grid);
    complexAddProductInPlace(outputHx, complexAy(longitudinalCurl, grid), epsilonY, grid.epsilonYImaginary, 1);
    complexAddProductInPlace(outputHy, complexAx(longitudinalCurl, grid), epsilonX, grid.epsilonXImaginary, -1);
    complexAddProductInPlace(outputHx, hx, epsilonY, grid.epsilonYImaginary, k0 ** 2);
    complexAddProductInPlace(outputHy, hy, epsilonX, grid.epsilonXImaginary, k0 ** 2);
    return complexJoin(outputHx, outputHy);
  } : applyReal;

  return { grid, k0, hxSize, hySize, apply, complex };
}

function solveLargestEigenpairs(
  operator: OperatorContext,
  arnoldiDimension: number,
  requestedPairs: number,
  config: WaveguideConfig,
): RitzPair[] {
  const physicalVectorSize = operator.hxSize + operator.hySize;
  const vectorSize = physicalVectorSize * (operator.complex ? 2 : 1);
  const { exteriorIndex, maximumIndex } = guidanceBounds(config);
  const targetIndex = 0.55 * maximumIndex + 0.45 * exteriorIndex;
  const shift = (operator.k0 * targetIndex) ** 2;
  const basis: Float64Array[] = [];
  const hessenberg = Array.from({ length: arnoldiDimension + 1 }, () => new Float64Array(arnoldiDimension));
  let vector = deterministicUnitVector(vectorSize);

  for (let column = 0; column < arnoldiDimension; column += 1) {
    basis.push(vector);
    const product = solveShiftedSystem(operator, shift, vector);

    for (let row = 0; row <= column; row += 1) {
      const projection = dot(basis[row], product);
      hessenberg[row][column] += projection;
      addScaledInPlace(product, basis[row], -projection);
    }
    for (let row = 0; row <= column; row += 1) {
      const correction = dot(basis[row], product);
      hessenberg[row][column] += correction;
      addScaledInPlace(product, basis[row], -correction);
    }

    const nextNorm = norm(product);
    hessenberg[column + 1][column] = nextNorm;
    if (nextNorm < 1e-12 || column === arnoldiDimension - 1) break;
    vector = scale(product, 1 / nextNorm);
  }

  const dimension = basis.length;
  const reduced = Matrix.zeros(dimension, dimension);
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) reduced.set(row, column, hessenberg[row][column]);
  }
  const decomposition = new EigenvalueDecomposition(reduced, { assumeSymmetric: false });
  const eigenvectors = decomposition.eigenvectorMatrix;
  const candidates: RitzPair[] = [];

  for (let column = 0; column < dimension; column += 1) {
    const inverseReal = decomposition.realEigenvalues[column];
    const inverseImaginary = decomposition.imaginaryEigenvalues[column];
    if (!operator.complex && Math.abs(inverseImaginary) > 1e-7) continue;
    if (operator.complex && inverseImaginary < -1e-10) continue;
    const inverseMagnitudeSquared = inverseReal ** 2 + inverseImaginary ** 2;
    if (inverseMagnitudeSquared < 1e-24) continue;
    const eigenvalue = shift + inverseReal / inverseMagnitudeSquared;
    const eigenvalueImaginary = -inverseImaginary / inverseMagnitudeSquared;
    if (!(eigenvalue > 0)) continue;
    const ritzBlockReal = new Float64Array(vectorSize);
    const ritzBlockImaginary = new Float64Array(vectorSize);
    for (let basisIndex = 0; basisIndex < dimension; basisIndex += 1) {
      addScaledInPlace(ritzBlockReal, basis[basisIndex], eigenvectors.get(basisIndex, column));
      if (Math.abs(inverseImaginary) > 1e-10 && column + 1 < dimension) {
        addScaledInPlace(ritzBlockImaginary, basis[basisIndex], eigenvectors.get(basisIndex, column + 1));
      }
    }
    const ritzVector = operator.complex ? new Float64Array(physicalVectorSize) : ritzBlockReal;
    const ritzVectorImaginary = operator.complex ? new Float64Array(physicalVectorSize) : undefined;
    if (operator.complex && ritzVectorImaginary) {
      for (let index = 0; index < physicalVectorSize; index += 1) {
        ritzVector[index] = 0.5 * (ritzBlockReal[index] - ritzBlockImaginary[physicalVectorSize + index]);
        ritzVectorImaginary[index] = 0.5 * (ritzBlockImaginary[index] + ritzBlockReal[physicalVectorSize + index]);
      }
    }
    const vectorNorm = Math.sqrt(norm(ritzVector) ** 2 + (ritzVectorImaginary ? norm(ritzVectorImaginary) ** 2 : 0));
    if (vectorNorm < 1e-12) continue;
    multiplyScalarInPlace(ritzVector, 1 / vectorNorm);
    if (ritzVectorImaginary) multiplyScalarInPlace(ritzVectorImaginary, 1 / vectorNorm);
    const residualInput = operator.complex
      ? complexBlock(ritzVector, ritzVectorImaginary as Float64Array)
      : ritzVector;
    const residualVector = operator.apply(residualInput);
    addComplexEigenvalueInPlace(residualVector, residualInput, eigenvalue, eigenvalueImaginary, operator.complex);
    candidates.push({
      eigenvalue,
      eigenvalueImaginary,
      vector: ritzVector,
      vectorImaginary: ritzVectorImaginary,
      residual: norm(residualVector) / Math.max(Math.abs(eigenvalue), 1),
    });
  }

  return candidates
    .sort((first, second) => second.eigenvalue - first.eigenvalue)
    .slice(0, requestedPairs);
}

function complexBlock(real: Float64Array, imaginary: Float64Array): Float64Array {
  const output = new Float64Array(2 * real.length);
  output.set(real);
  output.set(imaginary, real.length);
  return output;
}

function addComplexEigenvalueInPlace(target: Float64Array, vector: Float64Array, real: number, imaginary: number, complex: boolean): void {
  if (!complex) { addScaledInPlace(target, vector, -real); return; }
  const size = vector.length / 2;
  for (let index = 0; index < size; index += 1) {
    target[index] -= real * vector[index] - imaginary * vector[size + index];
    target[size + index] -= imaginary * vector[index] + real * vector[size + index];
  }
}

function solveShiftedSystem(operator: OperatorContext, shift: number, rightHandSide: Float64Array): Float64Array {
  const size = rightHandSide.length;
  const solution = new Float64Array(size);
  let residual = rightHandSide.slice();
  const shadow = residual.slice();
  let direction: Float64Array = new Float64Array(size);
  let operatorDirection: Float64Array = new Float64Array(size);
  let rhoPrevious = 1;
  let alpha = 1;
  let omega = 1;
  const tolerance = 1e-5 * Math.max(norm(rightHandSide), 1);

  const applyShifted = (vector: Float64Array) => {
    const output = operator.apply(vector);
    addScaledInPlace(output, vector, -shift);
    return output;
  };

  for (let iteration = 0; iteration < 180; iteration += 1) {
    const rho = dot(shadow, residual);
    if (Math.abs(rho) < 1e-30) break;
    const beta = (rho / rhoPrevious) * (alpha / omega);
    for (let index = 0; index < size; index += 1) {
      direction[index] = residual[index] + beta * (direction[index] - omega * operatorDirection[index]);
    }
    operatorDirection = applyShifted(direction);
    const denominator = dot(shadow, operatorDirection);
    if (Math.abs(denominator) < 1e-30) break;
    alpha = rho / denominator;
    const intermediate = residual.slice();
    addScaledInPlace(intermediate, operatorDirection, -alpha);
    if (norm(intermediate) <= tolerance) {
      addScaledInPlace(solution, direction, alpha);
      return solution;
    }
    const operatorIntermediate = applyShifted(intermediate);
    const omegaDenominator = dot(operatorIntermediate, operatorIntermediate);
    if (omegaDenominator < 1e-30) break;
    omega = dot(operatorIntermediate, intermediate) / omegaDenominator;
    addScaledInPlace(solution, direction, alpha);
    addScaledInPlace(solution, intermediate, omega);
    residual = intermediate;
    addScaledInPlace(residual, operatorIntermediate, -omega);
    if (norm(residual) <= tolerance) return solution;
    if (Math.abs(omega) < 1e-30) break;
    rhoPrevious = rho;
  }
  return solution;
}

function buildMode(pair: RitzPair, order: number, config: WaveguideConfig, operator: OperatorContext): WaveguideMode {
  const { grid, hxSize, k0 } = operator;
  const { nx, ny } = grid;
  const betaComplex = complexSquareRoot(pair.eigenvalue, pair.eigenvalueImaginary);
  const beta = betaComplex.real;
  const imaginaryVector = pair.vectorImaginary ?? new Float64Array(pair.vector.length);
  const hx: ComplexArray = { real: pair.vector.subarray(0, hxSize), imaginary: imaginaryVector.subarray(0, hxSize) };
  const hy: ComplexArray = { real: pair.vector.subarray(hxSize), imaginary: imaginaryVector.subarray(hxSize) };
  const transverseDivergence = complexAdd(complexBx(hx, grid), complexBy(hy, grid));
  const longitudinalCurl = complexSubtract(complexDyOperator(hx, grid), complexDxOperator(hy, grid));
  complexMultiplyInPlace(longitudinalCurl, grid.inverseEpsilonZ, grid.inverseEpsilonZImaginary);
  const correction = complexSubtract(complexBx(complexAy(longitudinalCurl, grid), grid), complexBy(complexAx(longitudinalCurl, grid), grid));
  complexAddScaledInPlace(transverseDivergence, correction, 1 / k0 ** 2);
  const hz = complexDivideScalar(transverseDivergence, betaComplex.real, betaComplex.imaginary);
  const ex = complexSubtract(complexScaleScalar(hy, betaComplex.real, betaComplex.imaginary), complexCy(hz, grid));
  complexMultiplyInPlace(ex, grid.inverseEpsilonX, grid.inverseEpsilonXImaginary);
  complexMultiplyScalarInPlace(ex, 1 / k0);
  const ey = complexAdd(complexScaleScalar(hx, -betaComplex.real, -betaComplex.imaginary), complexCx(hz, grid));
  complexMultiplyInPlace(ey, grid.inverseEpsilonY, grid.inverseEpsilonYImaginary);
  complexMultiplyScalarInPlace(ey, 1 / k0);
  const ez = complexScaleScalar(longitudinalCurl, -1 / k0, 0);

  const collocatedEx = complexAverage(ex, (part) => averageVertical(part, nx, ny));
  const collocatedEy = complexAverage(ey, (part) => averageHorizontal(part, nx, ny));
  const collocatedEz = complexAverage(ez, (part) => averageNodes(part, nx, ny));
  const collocatedHx = complexAverage(hx, (part) => averageHorizontal(part, nx, ny));
  const collocatedHy = complexAverage(hy, (part) => averageVertical(part, nx, ny));
  const collocatedHz = hz;
  rotateComplexFields([collocatedEx, collocatedEy, collocatedEz, collocatedHx, collocatedHy, collocatedHz]);
  const electricIntensity = new Float64Array(nx * ny);
  const magneticIntensity = new Float64Array(nx * ny);
  const rawPoynting = new Float64Array(nx * ny);
  let electricTotal = 0;
  let electricCore = 0;
  let electricSquared = 0;
  let exEnergy = 0;
  let eyEnergy = 0;
  let ezEnergy = 0;
  let lossWeightedEnergy = 0;

  for (let index = 0; index < electricIntensity.length; index += 1) {
    const e2 = complexMagnitudeSquaredAt(collocatedEx, index) + complexMagnitudeSquaredAt(collocatedEy, index) + complexMagnitudeSquaredAt(collocatedEz, index);
    const h2 = complexMagnitudeSquaredAt(collocatedHx, index) + complexMagnitudeSquaredAt(collocatedHy, index) + complexMagnitudeSquaredAt(collocatedHz, index);
    electricIntensity[index] = e2;
    magneticIntensity[index] = h2;
    rawPoynting[index] = 0.5 * (
      collocatedEx.real[index] * collocatedHy.real[index] + collocatedEx.imaginary[index] * collocatedHy.imaginary[index]
      - collocatedEy.real[index] * collocatedHx.real[index] - collocatedEy.imaginary[index] * collocatedHx.imaginary[index]
    );
    const area = grid.cellArea[index];
    electricTotal += e2 * area;
    electricSquared += e2 ** 2 * area;
    exEnergy += complexMagnitudeSquaredAt(collocatedEx, index) * area;
    eyEnergy += complexMagnitudeSquaredAt(collocatedEy, index) * area;
    ezEnergy += complexMagnitudeSquaredAt(collocatedEz, index) * area;
    lossWeightedEnergy += grid.extinctionCell[index] * grid.epsilonCell[index] * e2 * area;
    electricCore += grid.coreFraction[index] * grid.epsilonCell[index] * e2 * area;
  }
  let weightedElectricTotal = 0;
  for (let index = 0; index < electricIntensity.length; index += 1) {
    weightedElectricTotal += grid.epsilonCell[index] * electricIntensity[index] * grid.cellArea[index];
  }

  const vacuumImpedanceOhm = 376.730313668;
  let powerForUnitMagneticFieldW = 0;
  for (let index = 0; index < rawPoynting.length; index += 1) {
    powerForUnitMagneticFieldW += vacuumImpedanceOhm * rawPoynting[index] * grid.cellArea[index] * 1e-12;
  }
  const hScale = 1 / Math.sqrt(Math.max(Math.abs(powerForUnitMagneticFieldW), 1e-30));
  const eScale = vacuumImpedanceOhm * hScale * Math.sign(powerForUnitMagneticFieldW || 1);
  const physicalEx = complexScaleScalar(collocatedEx, eScale, 0);
  const physicalEy = complexScaleScalar(collocatedEy, eScale, 0);
  const physicalEz = complexScaleScalar(collocatedEz, eScale, 0);
  const physicalHx = complexScaleScalar(collocatedHx, hScale, 0);
  const physicalHy = complexScaleScalar(collocatedHy, hScale, 0);
  const physicalHz = complexScaleScalar(collocatedHz, hScale, 0);
  const physicalIntensity = new Float64Array(nx * ny);
  const physicalPoynting = new Float64Array(nx * ny);
  let modalPowerW = 0;
  for (let index = 0; index < physicalIntensity.length; index += 1) {
    physicalIntensity[index] = complexMagnitudeSquaredAt(physicalEx, index) + complexMagnitudeSquaredAt(physicalEy, index) + complexMagnitudeSquaredAt(physicalEz, index);
    physicalPoynting[index] = 0.5 * (
      physicalEx.real[index] * physicalHy.real[index] + physicalEx.imaginary[index] * physicalHy.imaginary[index]
      - physicalEy.real[index] * physicalHx.real[index] - physicalEy.imaginary[index] * physicalHx.imaginary[index]
    );
    modalPowerW += physicalPoynting[index] * grid.cellArea[index] * 1e-12;
  }
  const fields: Record<FieldComponent, number[][]> = {
    Ex: toMatrix(physicalEx.real, nx, ny),
    Ey: toMatrix(physicalEy.real, nx, ny),
    Ez: toMatrix(physicalEz.real, nx, ny),
    Hx: toMatrix(physicalHx.real, nx, ny),
    Hy: toMatrix(physicalHy.real, nx, ny),
    Hz: toMatrix(physicalHz.real, nx, ny),
    intensity: toMatrix(physicalIntensity, nx, ny),
    poynting: toMatrix(physicalPoynting, nx, ny),
  };
  const transverseElectricEnergy = exEnergy + eyEnergy;
  const polarization = exEnergy >= eyEnergy ? "quasi-TE" : "quasi-TM";

  return {
    id: `${polarization === "quasi-TE" ? "TE" : "TM"}${order}`,
    order,
    polarization,
    effectiveIndex: beta / k0,
    effectiveIndexImaginary: Math.abs(betaComplex.imaginary / k0),
    propagationConstantPerUm: beta,
    residual: pair.residual,
    electricConfinement: electricCore / weightedElectricTotal,
    effectiveAreaUm2: electricTotal ** 2 / electricSquared,
    longitudinalElectricFraction: ezEnergy / electricTotal,
    xPolarizedElectricFraction: exEnergy / transverseElectricEnergy,
    lossDbPerCm: operator.complex
      ? (20 / Math.log(10)) * Math.abs(betaComplex.imaginary) * 10_000
      : (4 * Math.PI * 10_000 * 10 / Math.log(10) / config.wavelengthUm)
        * (lossWeightedEnergy / Math.max(weightedElectricTotal, 1e-30)),
    modalPowerW,
    peakPoyntingWPerM2: Math.max(...physicalPoynting),
    fields,
  };
}

function complexSquareRoot(real: number, imaginary: number): { real: number; imaginary: number } {
  const magnitude = Math.hypot(real, imaginary);
  const rootReal = Math.sqrt(Math.max(0, (magnitude + real) / 2));
  return { real: rootReal, imaginary: Math.sign(imaginary || 1) * Math.sqrt(Math.max(0, (magnitude - real) / 2)) };
}

function ax(nodes: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[row * nx + column] = (nodes[row * (nx + 1) + column + 1] - nodes[row * (nx + 1) + column]) / dx[column];
    }
  }
  return output;
}

function ay(nodes: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      output[row * (nx + 1) + column] = (nodes[(row + 1) * (nx + 1) + column] - nodes[row * (nx + 1) + column]) / dy[row];
    }
  }
  return output;
}

function bx(edges: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (edges[row * (nx + 1) + column + 1] - edges[row * (nx + 1) + column]) / dx[column];
    }
  }
  return output;
}

function by(edges: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (edges[(row + 1) * nx + column] - edges[row * nx + column]) / dy[row];
    }
  }
  return output;
}

function cx(cells: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? cells[cellIndex(row, column - 1, nx)] : 0;
      const east = column < nx ? cells[cellIndex(row, column, nx)] : 0;
      output[row * (nx + 1) + column] = (east - west) / dx[column];
    }
  }
  return output;
}

function cy(cells: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = row > 0 ? cells[cellIndex(row - 1, column, nx)] : 0;
      const north = row < ny ? cells[cellIndex(row, column, nx)] : 0;
      output[row * nx + column] = (north - south) / dy[row];
    }
  }
  return output;
}

function dxOperator(edges: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? edges[row * nx + column - 1] : 0;
      const east = column < nx ? edges[row * nx + column] : 0;
      output[row * (nx + 1) + column] = (east - west) / dx[column];
    }
  }
  return output;
}

function dyOperator(edges: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = row > 0 ? edges[(row - 1) * (nx + 1) + column] : 0;
      const north = row < ny ? edges[row * (nx + 1) + column] : 0;
      output[row * (nx + 1) + column] = (north - south) / dy[row];
    }
  }
  return output;
}

function complexSlice(vector: Float64Array, start: number, length: number, vectorSize: number): ComplexArray {
  return { real: vector.subarray(start, start + length), imaginary: vector.subarray(vectorSize + start, vectorSize + start + length) };
}

function complexJoin(first: ComplexArray, second: ComplexArray): Float64Array {
  const vectorSize = first.real.length + second.real.length;
  const output = new Float64Array(2 * vectorSize);
  output.set(first.real, 0);
  output.set(second.real, first.real.length);
  output.set(first.imaginary, vectorSize);
  output.set(second.imaginary, vectorSize + first.real.length);
  return output;
}

function complexAdd(first: ComplexArray, second: ComplexArray): ComplexArray {
  return { real: add(first.real, second.real), imaginary: add(first.imaginary, second.imaginary) };
}

function complexSubtract(first: ComplexArray, second: ComplexArray): ComplexArray {
  return { real: subtract(first.real, second.real), imaginary: subtract(first.imaginary, second.imaginary) };
}

function complexAddScaledInPlace(target: ComplexArray, source: ComplexArray, factor: number): void {
  addScaledInPlace(target.real, source.real, factor);
  addScaledInPlace(target.imaginary, source.imaginary, factor);
}

function complexScaleScalar(values: ComplexArray, real: number, imaginary: number): ComplexArray {
  const output = { real: values.real.slice(), imaginary: values.imaginary.slice() };
  for (let index = 0; index < output.real.length; index += 1) {
    const nextReal = values.real[index] * real - values.imaginary[index] * imaginary;
    output.imaginary[index] = values.real[index] * imaginary + values.imaginary[index] * real;
    output.real[index] = nextReal;
  }
  return output;
}

function complexDivideScalar(values: ComplexArray, real: number, imaginary: number): ComplexArray {
  const denominator = real ** 2 + imaginary ** 2;
  return complexScaleScalar(values, real / denominator, -imaginary / denominator);
}

function complexMultiplyScalarInPlace(values: ComplexArray, factor: number): void {
  multiplyScalarInPlace(values.real, factor);
  multiplyScalarInPlace(values.imaginary, factor);
}

function complexAverage(values: ComplexArray, average: (part: Float64Array) => Float64Array): ComplexArray {
  return { real: average(values.real), imaginary: average(values.imaginary) };
}

function complexMagnitudeSquaredAt(values: ComplexArray, index: number): number {
  return values.real[index] ** 2 + values.imaginary[index] ** 2;
}

function rotateComplexFields(fields: ComplexArray[]): void {
  const reference = fields[0];
  let peak = 0;
  for (let index = 1; index < reference.real.length; index += 1) {
    if (complexMagnitudeSquaredAt(reference, index) > complexMagnitudeSquaredAt(reference, peak)) peak = index;
  }
  const phase = Math.atan2(reference.imaginary[peak], reference.real[peak]);
  const cosine = Math.cos(phase);
  const sine = Math.sin(phase);
  for (const field of fields) {
    for (let index = 0; index < field.real.length; index += 1) {
      const nextReal = field.real[index] * cosine + field.imaginary[index] * sine;
      field.imaginary[index] = field.imaginary[index] * cosine - field.real[index] * sine;
      field.real[index] = nextReal;
    }
  }
}

function complexMultiplyInPlace(target: ComplexArray, real: Float64Array, imaginary: Float64Array): void {
  for (let index = 0; index < target.real.length; index += 1) {
    const nextReal = target.real[index] * real[index] - target.imaginary[index] * imaginary[index];
    target.imaginary[index] = target.real[index] * imaginary[index] + target.imaginary[index] * real[index];
    target.real[index] = nextReal;
  }
}

function complexAddProductInPlace(target: ComplexArray, source: ComplexArray, real: Float64Array, imaginary: Float64Array, factor: number): void {
  for (let index = 0; index < target.real.length; index += 1) {
    target.real[index] += factor * (source.real[index] * real[index] - source.imaginary[index] * imaginary[index]);
    target.imaginary[index] += factor * (source.real[index] * imaginary[index] + source.imaginary[index] * real[index]);
  }
}

function complexDerivative(
  values: ComplexArray,
  derivative: (part: Float64Array) => Float64Array,
  stretchReal: Float64Array,
  stretchImaginary: Float64Array,
  stretchIndex: (index: number) => number,
): ComplexArray {
  const output = { real: derivative(values.real), imaginary: derivative(values.imaginary) };
  for (let index = 0; index < output.real.length; index += 1) {
    const factor = stretchIndex(index);
    const nextReal = output.real[index] * stretchReal[factor] - output.imaginary[index] * stretchImaginary[factor];
    output.imaginary[index] = output.real[index] * stretchImaginary[factor] + output.imaginary[index] * stretchReal[factor];
    output.real[index] = nextReal;
  }
  return output;
}

function complexAx(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => ax(part, grid.nx, grid.ny, grid.dxCell), grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary, (index) => index % grid.nx);
}

function complexAy(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => ay(part, grid.nx, grid.ny, grid.dyCell), grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary, (index) => Math.floor(index / (grid.nx + 1)));
}

function complexBx(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => bx(part, grid.nx, grid.ny, grid.dxCell), grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary, (index) => index % grid.nx);
}

function complexBy(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => by(part, grid.nx, grid.ny, grid.dyCell), grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary, (index) => Math.floor(index / grid.nx));
}

function complexCx(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => cx(part, grid.nx, grid.ny, grid.dxDual), grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
}

function complexCy(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => cy(part, grid.nx, grid.ny, grid.dyDual), grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, (index) => Math.floor(index / grid.nx));
}

function complexDxOperator(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => dxOperator(part, grid.nx, grid.ny, grid.dxDual), grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
}

function complexDyOperator(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => dyOperator(part, grid.nx, grid.ny, grid.dyDual), grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, (index) => Math.floor(index / (grid.nx + 1)));
}

function averageVertical(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (values[row * nx + column] + values[(row + 1) * nx + column]) / 2;
    }
  }
  return output;
}

function averageHorizontal(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (values[row * (nx + 1) + column] + values[row * (nx + 1) + column + 1]) / 2;
    }
  }
  return output;
}

function averageNodes(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (
        values[row * (nx + 1) + column]
        + values[row * (nx + 1) + column + 1]
        + values[(row + 1) * (nx + 1) + column]
        + values[(row + 1) * (nx + 1) + column + 1]
      ) / 4;
    }
  }
  return output;
}

function deterministicUnitVector(size: number): Float64Array {
  const vector = new Float64Array(size);
  let state = 0x9e3779b9;
  for (let index = 0; index < size; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    vector[index] = state / 0x1_0000_0000 - 0.5;
  }
  return scale(vector, 1 / norm(vector));
}

function toMatrix(values: Float64Array, nx: number, ny: number): number[][] {
  return Array.from({ length: ny }, (_, row) => Array.from(values.subarray(row * nx, (row + 1) * nx)));
}

function reciprocal(values: Float64Array): Float64Array {
  return Float64Array.from(values, (value) => 1 / value);
}

function add(first: Float64Array, second: Float64Array): Float64Array {
  const output = first.slice();
  addScaledInPlace(output, second, 1);
  return output;
}

function subtract(first: Float64Array, second: Float64Array): Float64Array {
  const output = first.slice();
  addScaledInPlace(output, second, -1);
  return output;
}

function scale(values: Float64Array, factor: number): Float64Array {
  const output = values.slice();
  multiplyScalarInPlace(output, factor);
  return output;
}

function addScaledInPlace(target: Float64Array, source: Float64Array, factor: number, weights?: Float64Array): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] += factor * source[index] * (weights?.[index] ?? 1);
  }
}

function multiplyInPlace(target: Float64Array, weights: Float64Array): void {
  for (let index = 0; index < target.length; index += 1) target[index] *= weights[index];
}

function multiplyScalarInPlace(target: Float64Array, factor: number): void {
  for (let index = 0; index < target.length; index += 1) target[index] *= factor;
}

function dot(first: Float64Array, second: Float64Array): number {
  let total = 0;
  for (let index = 0; index < first.length; index += 1) total += first[index] * second[index];
  return total;
}

function norm(values: Float64Array): number {
  return Math.sqrt(dot(values, values));
}

function cellIndex(row: number, column: number, nx: number): number {
  return row * nx + column;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
