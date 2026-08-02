import { EigenvalueDecomposition, Matrix } from "ml-matrix";

export type FieldComponent = "Ex" | "Ey" | "Ez" | "Hx" | "Hy" | "Hz" | "intensity";
export type GeometryType = "channel" | "rib" | "slot" | "multilayer";

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
}

export interface WaveguideMode {
  id: string;
  order: number;
  polarization: "quasi-TE" | "quasi-TM";
  effectiveIndex: number;
  propagationConstantPerUm: number;
  residual: number;
  electricConfinement: number;
  effectiveAreaUm2: number;
  longitudinalElectricFraction: number;
  xPolarizedElectricFraction: number;
  lossDbPerCm: number;
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
  region: Uint8Array;
  extinctionCell: Float64Array;
  epsilonX: Float64Array;
  epsilonY: Float64Array;
  inverseEpsilonX: Float64Array;
  inverseEpsilonY: Float64Array;
  inverseEpsilonZ: Float64Array;
}

interface OperatorContext {
  grid: Grid;
  k0: number;
  hxSize: number;
  hySize: number;
  apply: (vector: Float64Array) => Float64Array;
}

interface RitzPair {
  eigenvalue: number;
  vector: Float64Array;
  residual: number;
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
    config.substrateDispersionPerUm, config.meshBias,
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
  if ((config.geometry ?? "channel") === "rib" && ((config.slabHeightUm ?? 0) <= 0 || (config.slabHeightUm ?? 0) >= config.heightUm)) {
    errors.push("Rib slab height must be positive and smaller than the total core height.");
  }
  if ((config.geometry ?? "channel") === "slot" && ((config.slotGapUm ?? 0) <= 0 || (config.slotGapUm ?? 0) >= config.widthUm)) {
    errors.push("Slot gap must be positive and smaller than the total core width.");
  }
  if ((config.geometry ?? "channel") === "multilayer" && ((config.substrateIndex ?? 0) < 1 || (config.substrateIndex ?? 0) > PARAMETER_MAXIMUMS.refractiveIndex)) {
    errors.push(`Substrate index must be between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if (finiteOptional) {
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
    operator.hxSize + operator.hySize - 1,
    Math.max(58, config.modeCount * 22, Math.ceil(config.gridResolution * (2 + (config.meshBias ?? 0)))),
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

function materialValues(config: WaveguideConfig) {
  const reference = config.materialReferenceWavelengthUm ?? config.wavelengthUm;
  const offset = config.wavelengthUm - reference;
  const values = (base: number, ny: number | undefined, nz: number | undefined, k: number | undefined, slope: number | undefined) => ({
    nx: base + (slope ?? 0) * offset,
    ny: (ny ?? base) + (slope ?? 0) * offset,
    nz: (nz ?? base) + (slope ?? 0) * offset,
    k: k ?? 0,
  });
  return {
    core: values(config.coreIndex, config.coreIndexY, config.coreIndexZ, config.coreExtinction, config.coreDispersionPerUm),
    cladding: values(config.claddingIndex, config.claddingIndexY, config.claddingIndexZ, config.claddingExtinction, config.claddingDispersionPerUm),
    substrate: values(config.substrateIndex ?? config.claddingIndex, config.substrateIndexY, config.substrateIndexZ, config.substrateExtinction, config.substrateDispersionPerUm),
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

function regionAt(x: number, y: number, config: WaveguideConfig): 0 | 1 | 2 {
  const geometry = config.geometry ?? "channel";
  const insideHeight = Math.abs(y) <= config.heightUm / 2;
  if (geometry === "rib") {
    const slabTop = -config.heightUm / 2 + (config.slabHeightUm ?? config.heightUm / 2);
    if ((insideHeight && Math.abs(x) <= config.widthUm / 2) || (y >= -config.heightUm / 2 && y <= slabTop)) return 1;
  } else if (geometry === "slot") {
    const gap = config.slotGapUm ?? config.widthUm / 5;
    if (insideHeight && Math.abs(x) >= gap / 2 && Math.abs(x) <= config.widthUm / 2) return 1;
  } else if (Math.abs(x) <= config.widthUm / 2 && insideHeight) {
    return 1;
  }
  if (geometry === "multilayer" && y < -config.heightUm / 2) return 2;
  return 0;
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
  const domainWidth = config.widthUm + 2 * config.paddingUm;
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
  const epsilonCell = new Float64Array(nx * ny);
  const extinctionCell = new Float64Array(nx * ny);
  const cellArea = new Float64Array(nx * ny);
  const region = new Uint8Array(nx * ny);
  const material = materialValues(config);

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cellIndex(row, column, nx);
      const materialRegion = regionAt(x[column], y[row], config);
      const values = materialRegion === 1 ? material.core : materialRegion === 2 ? material.substrate : material.cladding;
      region[index] = materialRegion;
      epsilonCellX[index] = values.nx ** 2;
      epsilonCellY[index] = values.ny ** 2;
      epsilonCellZ[index] = values.nz ** 2;
      epsilonCell[index] = (epsilonCellX[index] + epsilonCellY[index] + epsilonCellZ[index]) / 3;
      extinctionCell[index] = values.k;
      cellArea[index] = dxCell[column] * dyCell[row];
    }
  }

  const epsilonX = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = epsilonCellX[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)];
      const north = epsilonCellX[cellIndex(clamp(row, 0, ny - 1), column, nx)];
      epsilonX[row * nx + column] = (south + north) / 2;
    }
  }

  const epsilonY = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = epsilonCellY[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)];
      const east = epsilonCellY[cellIndex(row, clamp(column, 0, nx - 1), nx)];
      epsilonY[row * (nx + 1) + column] = (west + east) / 2;
    }
  }

  const inverseEpsilonZ = new Float64Array((ny + 1) * (nx + 1));
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
      inverseEpsilonZ[row * (nx + 1) + column] = 1 / average;
    }
  }

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
    region,
    extinctionCell,
    epsilonX,
    epsilonY,
    inverseEpsilonX: reciprocal(epsilonX),
    inverseEpsilonY: reciprocal(epsilonY),
    inverseEpsilonZ,
  };
}

function createVectorOperator(grid: Grid, wavelengthUm: number): OperatorContext {
  const { nx, ny, dxCell, dyCell, dxDual, dyDual, epsilonX, epsilonY, inverseEpsilonZ } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const k0 = (2 * Math.PI) / wavelengthUm;
  const inverseK0Squared = 1 / k0 ** 2;

  const apply = (vector: Float64Array): Float64Array => {
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

  return { grid, k0, hxSize, hySize, apply };
}

function solveLargestEigenpairs(
  operator: OperatorContext,
  arnoldiDimension: number,
  requestedPairs: number,
  config: WaveguideConfig,
): RitzPair[] {
  const vectorSize = operator.hxSize + operator.hySize;
  const shift = 6 / operator.grid.dx ** 2 + 6 / operator.grid.dy ** 2 + (operator.k0 * config.coreIndex) ** 2;
  const basis: Float64Array[] = [];
  const hessenberg = Array.from({ length: arnoldiDimension + 1 }, () => new Float64Array(arnoldiDimension));
  let vector = deterministicUnitVector(vectorSize);

  for (let column = 0; column < arnoldiDimension; column += 1) {
    basis.push(vector);
    const product = operator.apply(vector);
    addScaledInPlace(product, vector, shift);

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
    if (Math.abs(decomposition.imaginaryEigenvalues[column]) > 1e-7) continue;
    const eigenvalue = decomposition.realEigenvalues[column] - shift;
    if (!(eigenvalue > 0)) continue;
    const ritzVector = new Float64Array(vectorSize);
    for (let basisIndex = 0; basisIndex < dimension; basisIndex += 1) {
      addScaledInPlace(ritzVector, basis[basisIndex], eigenvectors.get(basisIndex, column));
    }
    const vectorNorm = norm(ritzVector);
    if (vectorNorm < 1e-12) continue;
    multiplyScalarInPlace(ritzVector, 1 / vectorNorm);
    const residualVector = operator.apply(ritzVector);
    addScaledInPlace(residualVector, ritzVector, -eigenvalue);
    candidates.push({
      eigenvalue,
      vector: ritzVector,
      residual: norm(residualVector) / Math.max(Math.abs(eigenvalue), 1),
    });
  }

  return candidates
    .sort((first, second) => second.eigenvalue - first.eigenvalue)
    .slice(0, requestedPairs);
}

function buildMode(pair: RitzPair, order: number, config: WaveguideConfig, operator: OperatorContext): WaveguideMode {
  const { grid, hxSize, k0 } = operator;
  const { nx, ny, dxCell, dyCell, dxDual, dyDual } = grid;
  const beta = Math.sqrt(pair.eigenvalue);
  const hx = pair.vector.subarray(0, hxSize);
  const hy = pair.vector.subarray(hxSize);
  const transverseDivergence = add(bx(hx, nx, ny, dxCell), by(hy, nx, ny, dyCell));
  const longitudinalCurl = subtract(dyOperator(hx, nx, ny, dyDual), dxOperator(hy, nx, ny, dxDual));
  multiplyInPlace(longitudinalCurl, grid.inverseEpsilonZ);
  const correction = subtract(
    bx(ay(longitudinalCurl, nx, ny, dyCell), nx, ny, dxCell),
    by(ax(longitudinalCurl, nx, ny, dxCell), nx, ny, dyCell),
  );
  addScaledInPlace(transverseDivergence, correction, 1 / k0 ** 2);
  const hz = scale(transverseDivergence, 1 / beta);
  const ex = subtract(scale(hy, beta), cy(hz, nx, ny, dyDual));
  multiplyInPlace(ex, grid.inverseEpsilonX);
  multiplyScalarInPlace(ex, 1 / k0);
  const ey = add(scale(hx, -beta), cx(hz, nx, ny, dxDual));
  multiplyInPlace(ey, grid.inverseEpsilonY);
  multiplyScalarInPlace(ey, 1 / k0);
  const ez = scale(longitudinalCurl, -1 / k0);

  const collocatedEx = averageVertical(ex, nx, ny);
  const collocatedEy = averageHorizontal(ey, nx, ny);
  const collocatedEz = averageNodes(ez, nx, ny);
  const collocatedHx = averageHorizontal(hx, nx, ny);
  const collocatedHy = averageVertical(hy, nx, ny);
  const collocatedHz = hz;
  const electricIntensity = new Float64Array(nx * ny);
  const magneticIntensity = new Float64Array(nx * ny);
  let electricTotal = 0;
  let electricCore = 0;
  let electricSquared = 0;
  let exEnergy = 0;
  let eyEnergy = 0;
  let ezEnergy = 0;
  let lossWeightedEnergy = 0;

  for (let index = 0; index < electricIntensity.length; index += 1) {
    const e2 = collocatedEx[index] ** 2 + collocatedEy[index] ** 2 + collocatedEz[index] ** 2;
    const h2 = collocatedHx[index] ** 2 + collocatedHy[index] ** 2 + collocatedHz[index] ** 2;
    electricIntensity[index] = e2;
    magneticIntensity[index] = h2;
    const area = grid.cellArea[index];
    electricTotal += e2 * area;
    electricSquared += e2 ** 2 * area;
    exEnergy += collocatedEx[index] ** 2 * area;
    eyEnergy += collocatedEy[index] ** 2 * area;
    ezEnergy += collocatedEz[index] ** 2 * area;
    lossWeightedEnergy += grid.extinctionCell[index] * grid.epsilonCell[index] * e2 * area;
    if (grid.region[index] === 1) electricCore += grid.epsilonCell[index] * e2 * area;
  }
  let weightedElectricTotal = 0;
  for (let index = 0; index < electricIntensity.length; index += 1) {
    weightedElectricTotal += grid.epsilonCell[index] * electricIntensity[index] * grid.cellArea[index];
  }

  const eScale = 1 / Math.sqrt(Math.max(...electricIntensity));
  const hScale = 1 / Math.sqrt(Math.max(...magneticIntensity));
  const normalizedIntensity = scale(electricIntensity, 1 / Math.max(...electricIntensity));
  const fields: Record<FieldComponent, number[][]> = {
    Ex: toMatrix(scale(collocatedEx, eScale), nx, ny),
    Ey: toMatrix(scale(collocatedEy, eScale), nx, ny),
    Ez: toMatrix(scale(collocatedEz, eScale), nx, ny),
    Hx: toMatrix(scale(collocatedHx, hScale), nx, ny),
    Hy: toMatrix(scale(collocatedHy, hScale), nx, ny),
    Hz: toMatrix(scale(collocatedHz, hScale), nx, ny),
    intensity: toMatrix(normalizedIntensity, nx, ny),
  };
  const transverseElectricEnergy = exEnergy + eyEnergy;
  const polarization = exEnergy >= eyEnergy ? "quasi-TE" : "quasi-TM";

  return {
    id: `${polarization === "quasi-TE" ? "TE" : "TM"}${order}`,
    order,
    polarization,
    effectiveIndex: beta / k0,
    propagationConstantPerUm: beta,
    residual: pair.residual,
    electricConfinement: electricCore / weightedElectricTotal,
    effectiveAreaUm2: electricTotal ** 2 / electricSquared,
    longitudinalElectricFraction: ezEnergy / electricTotal,
    xPolarizedElectricFraction: exEnergy / transverseElectricEnergy,
    lossDbPerCm: (4 * Math.PI * 10_000 * 10 / Math.log(10) / config.wavelengthUm)
      * (lossWeightedEnergy / Math.max(weightedElectricTotal, 1e-30)),
    fields,
  };
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
