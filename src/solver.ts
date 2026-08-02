import { EigenvalueDecomposition, Matrix } from "ml-matrix";

export type FieldComponent = "Ex" | "Ey" | "Ez" | "Hx" | "Hy" | "Hz" | "intensity";

export interface WaveguideConfig {
  wavelengthUm: number;
  widthUm: number;
  heightUm: number;
  coreIndex: number;
  claddingIndex: number;
  paddingUm: number;
  gridResolution: number;
  modeCount: number;
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
  warnings: string[];
  arnoldiDimension: number;
}

interface Grid {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  x: number[];
  y: number[];
  epsilonCell: Float64Array;
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
  if (!Number.isFinite(config.wavelengthUm) || config.wavelengthUm < 0.2 || config.wavelengthUm > 20) {
    errors.push("Wavelength must be between 0.2 and 20 µm.");
  }
  if (!Number.isFinite(config.widthUm) || config.widthUm < 0.05 || config.widthUm > 20) {
    errors.push("Core width must be between 0.05 and 20 µm.");
  }
  if (!Number.isFinite(config.heightUm) || config.heightUm < 0.05 || config.heightUm > 20) {
    errors.push("Core height must be between 0.05 and 20 µm.");
  }
  if (!Number.isFinite(config.paddingUm) || config.paddingUm < 0.2 || config.paddingUm > 20) {
    errors.push("Cladding padding must be between 0.2 and 20 µm.");
  }
  if (!Number.isFinite(config.claddingIndex) || config.claddingIndex < 1 || config.claddingIndex > 5) {
    errors.push("Cladding index must be between 1 and 5.");
  }
  if (!Number.isFinite(config.coreIndex) || config.coreIndex <= config.claddingIndex || config.coreIndex > 6) {
    errors.push("Core index must be greater than the cladding index and no larger than 6.");
  }
  if (!Number.isInteger(config.gridResolution) || config.gridResolution < 24 || config.gridResolution > 64) {
    errors.push("Grid resolution must be an integer between 24 and 64.");
  }
  if (!Number.isInteger(config.modeCount) || config.modeCount < 1 || config.modeCount > 4) {
    errors.push("Requested modes must be an integer between 1 and 4.");
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
    Math.max(58, config.modeCount * 22),
  );
  const pairs = solveLargestEigenpairs(operator, arnoldiDimension, requestedRitzPairs, config);
  const guidedPairs = pairs.filter((pair) => {
    const effectiveIndex = Math.sqrt(Math.max(0, pair.eigenvalue)) / operator.k0;
    return effectiveIndex > config.claddingIndex + 1e-5 && effectiveIndex < config.coreIndex * 1.01;
  });
  const uniquePairs = guidedPairs.filter((pair, index, all) => {
    const effectiveIndex = Math.sqrt(pair.eigenvalue) / operator.k0;
    return all.findIndex((candidate) => (
      Math.abs(Math.sqrt(candidate.eigenvalue) / operator.k0 - effectiveIndex) < 1e-7
    )) === index;
  });
  const modes = uniquePairs
    .slice(0, config.modeCount)
    .map((pair, index) => buildMode(pair, index, config, operator));

  const warnings: string[] = [];
  const cellsAcrossCore = Math.min(config.widthUm / grid.dx, config.heightUm / grid.dy);
  if (cellsAcrossCore < 8) warnings.push("Fewer than 8 cells span the smallest core dimension; refine the grid before using quantitative values.");
  if (modes.length < config.modeCount) warnings.push(`Only ${modes.length} guided mode${modes.length === 1 ? " was" : "s were"} found inside the requested index interval.`);
  if (modes.some((mode) => mode.residual > 2e-3)) warnings.push("One or more eigenpairs have a high residual; increase grid resolution or reduce the requested mode count.");

  return {
    modes,
    xUm: grid.x,
    yUm: grid.y,
    nx: grid.nx,
    ny: grid.ny,
    dxUm: grid.dx,
    dyUm: grid.dy,
    warnings,
    arnoldiDimension,
  };
}

function createGrid(config: WaveguideConfig): Grid {
  const domainWidth = config.widthUm + 2 * config.paddingUm;
  const domainHeight = config.heightUm + 2 * config.paddingUm;
  const nominalStep = Math.max(domainWidth, domainHeight) / config.gridResolution;
  const nx = Math.max(12, Math.round(domainWidth / nominalStep));
  const ny = Math.max(12, Math.round(domainHeight / nominalStep));
  const dx = domainWidth / nx;
  const dy = domainHeight / ny;
  const x = Array.from({ length: nx }, (_, index) => -domainWidth / 2 + (index + 0.5) * dx);
  const y = Array.from({ length: ny }, (_, index) => -domainHeight / 2 + (index + 0.5) * dy);
  const epsilonCell = new Float64Array(nx * ny);

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const inCore = Math.abs(x[column]) <= config.widthUm / 2 && Math.abs(y[row]) <= config.heightUm / 2;
      epsilonCell[cellIndex(row, column, nx)] = (inCore ? config.coreIndex : config.claddingIndex) ** 2;
    }
  }

  const epsilonX = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = epsilonCell[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)];
      const north = epsilonCell[cellIndex(clamp(row, 0, ny - 1), column, nx)];
      epsilonX[row * nx + column] = (south + north) / 2;
    }
  }

  const epsilonY = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = epsilonCell[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)];
      const east = epsilonCell[cellIndex(row, clamp(column, 0, nx - 1), nx)];
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
        epsilonCell[cellIndex(south, west, nx)]
        + epsilonCell[cellIndex(south, east, nx)]
        + epsilonCell[cellIndex(north, west, nx)]
        + epsilonCell[cellIndex(north, east, nx)]
      ) / 4;
      inverseEpsilonZ[row * (nx + 1) + column] = 1 / average;
    }
  }

  return {
    nx,
    ny,
    dx,
    dy,
    x,
    y,
    epsilonCell,
    epsilonX,
    epsilonY,
    inverseEpsilonX: reciprocal(epsilonX),
    inverseEpsilonY: reciprocal(epsilonY),
    inverseEpsilonZ,
  };
}

function createVectorOperator(grid: Grid, wavelengthUm: number): OperatorContext {
  const { nx, ny, dx, dy, epsilonX, epsilonY, inverseEpsilonZ } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const k0 = (2 * Math.PI) / wavelengthUm;
  const inverseK0Squared = 1 / k0 ** 2;

  const apply = (vector: Float64Array): Float64Array => {
    const hx = vector.subarray(0, hxSize);
    const hy = vector.subarray(hxSize);
    const transverseDivergence = add(bx(hx, nx, ny, dx), by(hy, nx, ny, dy));
    const longitudinalCurl = subtract(dyOperator(hx, nx, ny, dy), dxOperator(hy, nx, ny, dx));
    multiplyInPlace(longitudinalCurl, inverseEpsilonZ);
    const correction = subtract(
      bx(ay(longitudinalCurl, nx, ny, dy), nx, ny, dx),
      by(ax(longitudinalCurl, nx, ny, dx), nx, ny, dy),
    );
    addScaledInPlace(transverseDivergence, correction, inverseK0Squared);

    const outputHx = cx(transverseDivergence, nx, ny, dx);
    const outputHy = cy(transverseDivergence, nx, ny, dy);
    addScaledInPlace(outputHx, ay(longitudinalCurl, nx, ny, dy), 1, epsilonY);
    addScaledInPlace(outputHy, ax(longitudinalCurl, nx, ny, dx), -1, epsilonX);
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
  const { nx, ny, dx, dy } = grid;
  const beta = Math.sqrt(pair.eigenvalue);
  const hx = pair.vector.subarray(0, hxSize);
  const hy = pair.vector.subarray(hxSize);
  const transverseDivergence = add(bx(hx, nx, ny, dx), by(hy, nx, ny, dy));
  const longitudinalCurl = subtract(dyOperator(hx, nx, ny, dy), dxOperator(hy, nx, ny, dx));
  multiplyInPlace(longitudinalCurl, grid.inverseEpsilonZ);
  const correction = subtract(
    bx(ay(longitudinalCurl, nx, ny, dy), nx, ny, dx),
    by(ax(longitudinalCurl, nx, ny, dx), nx, ny, dy),
  );
  addScaledInPlace(transverseDivergence, correction, 1 / k0 ** 2);
  const hz = scale(transverseDivergence, 1 / beta);
  const ex = subtract(scale(hy, beta), cy(hz, nx, ny, dy));
  multiplyInPlace(ex, grid.inverseEpsilonX);
  multiplyScalarInPlace(ex, 1 / k0);
  const ey = add(scale(hx, -beta), cx(hz, nx, ny, dx));
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

  for (let index = 0; index < electricIntensity.length; index += 1) {
    const e2 = collocatedEx[index] ** 2 + collocatedEy[index] ** 2 + collocatedEz[index] ** 2;
    const h2 = collocatedHx[index] ** 2 + collocatedHy[index] ** 2 + collocatedHz[index] ** 2;
    electricIntensity[index] = e2;
    magneticIntensity[index] = h2;
    electricTotal += e2;
    electricSquared += e2 ** 2;
    exEnergy += collocatedEx[index] ** 2;
    eyEnergy += collocatedEy[index] ** 2;
    ezEnergy += collocatedEz[index] ** 2;
    if (grid.epsilonCell[index] > config.claddingIndex ** 2 + 1e-9) electricCore += grid.epsilonCell[index] * e2;
  }
  let weightedElectricTotal = 0;
  for (let index = 0; index < electricIntensity.length; index += 1) {
    weightedElectricTotal += grid.epsilonCell[index] * electricIntensity[index];
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
    effectiveAreaUm2: (electricTotal ** 2 / electricSquared) * dx * dy,
    longitudinalElectricFraction: ezEnergy / electricTotal,
    xPolarizedElectricFraction: exEnergy / transverseElectricEnergy,
    fields,
  };
}

function ax(nodes: Float64Array, nx: number, ny: number, dx: number): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[row * nx + column] = (nodes[row * (nx + 1) + column + 1] - nodes[row * (nx + 1) + column]) / dx;
    }
  }
  return output;
}

function ay(nodes: Float64Array, nx: number, ny: number, dy: number): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      output[row * (nx + 1) + column] = (nodes[(row + 1) * (nx + 1) + column] - nodes[row * (nx + 1) + column]) / dy;
    }
  }
  return output;
}

function bx(edges: Float64Array, nx: number, ny: number, dx: number): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (edges[row * (nx + 1) + column + 1] - edges[row * (nx + 1) + column]) / dx;
    }
  }
  return output;
}

function by(edges: Float64Array, nx: number, ny: number, dy: number): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (edges[(row + 1) * nx + column] - edges[row * nx + column]) / dy;
    }
  }
  return output;
}

function cx(cells: Float64Array, nx: number, ny: number, dx: number): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? cells[cellIndex(row, column - 1, nx)] : 0;
      const east = column < nx ? cells[cellIndex(row, column, nx)] : 0;
      output[row * (nx + 1) + column] = (east - west) / dx;
    }
  }
  return output;
}

function cy(cells: Float64Array, nx: number, ny: number, dy: number): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = row > 0 ? cells[cellIndex(row - 1, column, nx)] : 0;
      const north = row < ny ? cells[cellIndex(row, column, nx)] : 0;
      output[row * nx + column] = (north - south) / dy;
    }
  }
  return output;
}

function dxOperator(edges: Float64Array, nx: number, ny: number, dx: number): Float64Array {
  const output = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? edges[row * nx + column - 1] : 0;
      const east = column < nx ? edges[row * nx + column] : 0;
      output[row * (nx + 1) + column] = (east - west) / dx;
    }
  }
  return output;
}

function dyOperator(edges: Float64Array, nx: number, ny: number, dy: number): Float64Array {
  const output = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = row > 0 ? edges[(row - 1) * (nx + 1) + column] : 0;
      const north = row < ny ? edges[row * (nx + 1) + column] : 0;
      output[row * (nx + 1) + column] = (north - south) / dy;
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
