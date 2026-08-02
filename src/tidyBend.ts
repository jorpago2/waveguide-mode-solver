import * as mathjs from "mathjs";
import {
  add as matrixAdd,
  complex,
  multiply as matrixMultiply,
  type Complex,
  type Matrix,
} from "mathjs";
import { factorizeSparseLu, solveSparseLu } from "./wasm/bendSolver";

type Numeric = number | Complex;

export interface TidyBendGrid {
  nx: number;
  ny: number;
  dxCell: number[];
  dyCell: number[];
  dxDual: number[];
  dyDual: number[];
  x: number[];
  xNodes: number[];
  epsilonX: Float64Array;
  epsilonY: Float64Array;
  epsilonXImaginary: Float64Array;
  epsilonYImaginary: Float64Array;
  inverseEpsilonZ: Float64Array;
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

export interface TidyBendOperator {
  size: number;
  complex: boolean;
  apply(vector: Float64Array): Float64Array;
  solveShifted(shift: number, rightHandSide: Float64Array): Float64Array;
  reconstructMagnetic(
    electricReal: Float64Array,
    electricImaginary: Float64Array,
    betaReal: number,
    betaImaginary: number,
  ): { real: Float64Array; imaginary: Float64Array };
}

interface SparseData {
  values: Numeric[];
  index: number[];
  ptr: number[];
  size: [number, number];
}

interface SparseJson extends SparseData {
  mathjs: "SparseMatrix";
}

type SparseConstructor = new (data: SparseData) => Matrix<Numeric>;
const Sparse = (mathjs as unknown as { SparseMatrix: SparseConstructor }).SparseMatrix;

function numeric(real: number, imaginary = 0): Numeric {
  return Math.abs(imaginary) < 1e-15 ? real : complex(real, imaginary);
}

function realPart(value: Numeric): number {
  return typeof value === "number" ? value : value.re;
}

function imaginaryPart(value: Numeric): number {
  return typeof value === "number" ? 0 : value.im;
}

function multiplyNumeric(first: Numeric, second: Numeric): Numeric {
  const ar = realPart(first);
  const ai = imaginaryPart(first);
  const br = realPart(second);
  const bi = imaginaryPart(second);
  return numeric(ar * br - ai * bi, ar * bi + ai * br);
}

function sparseFromColumns(rows: number, columns: number, entries: Array<[number, number, Numeric]>): Matrix<Numeric> {
  entries.sort((first, second) => first[1] - second[1] || first[0] - second[0]);
  const values: Numeric[] = [];
  const index: number[] = [];
  const ptr = new Array<number>(columns + 1).fill(0);
  let entryIndex = 0;
  for (let column = 0; column < columns; column += 1) {
    ptr[column] = values.length;
    while (entryIndex < entries.length && entries[entryIndex][1] === column) {
      const [row, , value] = entries[entryIndex];
      let accumulated = value;
      entryIndex += 1;
      while (entryIndex < entries.length && entries[entryIndex][1] === column && entries[entryIndex][0] === row) {
        const next = entries[entryIndex][2];
        accumulated = numeric(realPart(accumulated) + realPart(next), imaginaryPart(accumulated) + imaginaryPart(next));
        entryIndex += 1;
      }
      if (Math.hypot(realPart(accumulated), imaginaryPart(accumulated)) > 1e-15) {
        index.push(row);
        values.push(accumulated);
      }
    }
  }
  ptr[columns] = values.length;
  return new Sparse({ values, index, ptr, size: [rows, columns] });
}

function diagonal(values: Numeric[]): Matrix<Numeric> {
  const entries = values.map((value, index) => [index, index, value] as [number, number, Numeric]);
  return sparseFromColumns(values.length, values.length, entries);
}

function zero(rows: number, columns: number): Matrix<Numeric> {
  return new Sparse({ values: [], index: [], ptr: new Array(columns + 1).fill(0), size: [rows, columns] });
}

function scaleMatrix(matrix: Matrix<Numeric>, factor: number): Matrix<Numeric> {
  return matrixMultiply(matrix, factor) as Matrix<Numeric>;
}

function addMatrices(first: Matrix<Numeric>, second: Matrix<Numeric>): Matrix<Numeric> {
  return matrixAdd(first, second) as Matrix<Numeric>;
}

function multiplyMatrices(first: Matrix<Numeric>, second: Matrix<Numeric>): Matrix<Numeric> {
  return matrixMultiply(first, second) as Matrix<Numeric>;
}

function horizontal(first: Matrix<Numeric>, second: Matrix<Numeric>): Matrix<Numeric> {
  const firstJson = toSparseJson(first);
  const secondJson = toSparseJson(second);
  if (firstJson.size[0] !== secondJson.size[0]) throw new Error("Sparse horizontal blocks must have equal row counts.");
  return sparseFromColumns(firstJson.size[0], firstJson.size[1] + secondJson.size[1], [
    ...sparseEntries(firstJson),
    ...sparseEntries(secondJson, 0, firstJson.size[1]),
  ]);
}

function vertical(first: Matrix<Numeric>, second: Matrix<Numeric>): Matrix<Numeric> {
  const firstJson = toSparseJson(first);
  const secondJson = toSparseJson(second);
  if (firstJson.size[1] !== secondJson.size[1]) throw new Error("Sparse vertical blocks must have equal column counts.");
  return sparseFromColumns(firstJson.size[0] + secondJson.size[0], firstJson.size[1], [
    ...sparseEntries(firstJson),
    ...sparseEntries(secondJson, firstJson.size[0]),
  ]);
}

function complexAt(real: Float64Array, imaginary: Float64Array, index: number): Numeric {
  return numeric(real[index], imaginary[index]);
}

function repeatedMetric(coordinates: number[], repeats: number, signedRadius: number): Numeric[] {
  const values: Numeric[] = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (const coordinate of coordinates) values.push(1 + coordinate / signedRadius);
  }
  return values;
}

function derivativeMatrices(grid: TidyBendGrid): {
  ax: Matrix<Numeric>;
  ay: Matrix<Numeric>;
  bx: Matrix<Numeric>;
  by: Matrix<Numeric>;
  cx: Matrix<Numeric>;
  cy: Matrix<Numeric>;
  dx: Matrix<Numeric>;
  dy: Matrix<Numeric>;
} {
  const { nx, ny } = grid;
  const cells = nx * ny;
  const nodes = (nx + 1) * (ny + 1);
  const horizontalEdges = ny * (nx + 1);
  const verticalEdges = (ny + 1) * nx;
  const axEntries: Array<[number, number, Numeric]> = [];
  const ayEntries: Array<[number, number, Numeric]> = [];
  const bxEntries: Array<[number, number, Numeric]> = [];
  const byEntries: Array<[number, number, Numeric]> = [];
  const cxEntries: Array<[number, number, Numeric]> = [];
  const cyEntries: Array<[number, number, Numeric]> = [];
  const dxEntries: Array<[number, number, Numeric]> = [];
  const dyEntries: Array<[number, number, Numeric]> = [];

  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const output = row * nx + column;
      const factor = multiplyNumeric(
        complexAt(grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary, column),
        1 / grid.dxCell[column],
      );
      axEntries.push([output, row * (nx + 1) + column, multiplyNumeric(factor, -1)]);
      axEntries.push([output, row * (nx + 1) + column + 1, factor]);
    }
  }
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const output = row * (nx + 1) + column;
      const factor = multiplyNumeric(
        complexAt(grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary, row),
        1 / grid.dyCell[row],
      );
      ayEntries.push([output, row * (nx + 1) + column, multiplyNumeric(factor, -1)]);
      ayEntries.push([output, (row + 1) * (nx + 1) + column, factor]);
    }
  }
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const output = row * nx + column;
      const xFactor = multiplyNumeric(
        complexAt(grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary, column),
        1 / grid.dxCell[column],
      );
      bxEntries.push([output, row * (nx + 1) + column, multiplyNumeric(xFactor, -1)]);
      bxEntries.push([output, row * (nx + 1) + column + 1, xFactor]);
      const yFactor = multiplyNumeric(
        complexAt(grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary, row),
        1 / grid.dyCell[row],
      );
      byEntries.push([output, row * nx + column, multiplyNumeric(yFactor, -1)]);
      byEntries.push([output, (row + 1) * nx + column, yFactor]);
    }
  }
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const output = row * (nx + 1) + column;
      const factor = multiplyNumeric(
        complexAt(grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, column),
        1 / grid.dxDual[column],
      );
      if (column > 0) cxEntries.push([output, row * nx + column - 1, multiplyNumeric(factor, -1)]);
      if (column < nx) cxEntries.push([output, row * nx + column, factor]);
    }
  }
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const output = row * nx + column;
      const factor = multiplyNumeric(
        complexAt(grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, row),
        1 / grid.dyDual[row],
      );
      if (row > 0) cyEntries.push([output, (row - 1) * nx + column, multiplyNumeric(factor, -1)]);
      if (row < ny) cyEntries.push([output, row * nx + column, factor]);
    }
  }
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const output = row * (nx + 1) + column;
      const xFactor = multiplyNumeric(
        complexAt(grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, column),
        1 / grid.dxDual[column],
      );
      if (column > 0) dxEntries.push([output, row * nx + column - 1, multiplyNumeric(xFactor, -1)]);
      if (column < nx) dxEntries.push([output, row * nx + column, xFactor]);
      const yFactor = multiplyNumeric(
        complexAt(grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, row),
        1 / grid.dyDual[row],
      );
      if (row > 0) dyEntries.push([output, (row - 1) * (nx + 1) + column, multiplyNumeric(yFactor, -1)]);
      if (row < ny) dyEntries.push([output, row * (nx + 1) + column, yFactor]);
    }
  }

  return {
    ax: sparseFromColumns(verticalEdges, nodes, axEntries),
    ay: sparseFromColumns(horizontalEdges, nodes, ayEntries),
    bx: sparseFromColumns(cells, horizontalEdges, bxEntries),
    by: sparseFromColumns(cells, verticalEdges, byEntries),
    cx: sparseFromColumns(horizontalEdges, cells, cxEntries),
    cy: sparseFromColumns(verticalEdges, cells, cyEntries),
    dx: sparseFromColumns(nodes, verticalEdges, dxEntries),
    dy: sparseFromColumns(nodes, horizontalEdges, dyEntries),
  };
}

function toSparseJson(matrix: Matrix<Numeric>): SparseJson {
  const json = matrix.toJSON() as SparseJson;
  if (json.mathjs !== "SparseMatrix" || json.size.length !== 2) throw new Error("Expected a sparse bend operator.");
  return json;
}

function sparseEntries(matrix: SparseJson, rowOffset = 0, columnOffset = 0): Array<[number, number, Numeric]> {
  const entries: Array<[number, number, Numeric]> = [];
  for (let column = 0; column < matrix.size[1]; column += 1) {
    for (let entry = matrix.ptr[column]; entry < matrix.ptr[column + 1]; entry += 1) {
      entries.push([matrix.index[entry] + rowOffset, column + columnOffset, matrix.values[entry]]);
    }
  }
  return entries;
}

function multiplySparse(matrix: SparseJson, inputReal: Float64Array, inputImaginary: Float64Array): {
  real: Float64Array;
  imaginary: Float64Array;
} {
  const outputReal = new Float64Array(matrix.size[0]);
  const outputImaginary = new Float64Array(matrix.size[0]);
  for (let column = 0; column < matrix.size[1]; column += 1) {
    const xr = inputReal[column];
    const xi = inputImaginary[column];
    for (let entry = matrix.ptr[column]; entry < matrix.ptr[column + 1]; entry += 1) {
      const row = matrix.index[entry];
      const value = matrix.values[entry];
      const ar = realPart(value);
      const ai = imaginaryPart(value);
      outputReal[row] += ar * xr - ai * xi;
      outputImaginary[row] += ai * xr + ar * xi;
    }
  }
  return { real: outputReal, imaginary: outputImaginary };
}

function divideComplexVector(
  values: { real: Float64Array; imaginary: Float64Array },
  denominatorReal: number,
  denominatorImaginary: number,
): { real: Float64Array; imaginary: Float64Array } {
  const denominator = denominatorReal ** 2 + denominatorImaginary ** 2;
  if (denominator < 1e-30) throw new Error("Cannot reconstruct bend fields from a zero propagation constant.");
  const real = new Float64Array(values.real.length);
  const imaginary = new Float64Array(values.real.length);
  for (let index = 0; index < real.length; index += 1) {
    real[index] = (values.real[index] * denominatorReal + values.imaginary[index] * denominatorImaginary) / denominator;
    imaginary[index] = (values.imaginary[index] * denominatorReal - values.real[index] * denominatorImaginary) / denominator;
  }
  return { real, imaginary };
}

export function createTidyBendOperator(
  grid: TidyBendGrid,
  wavelengthUm: number,
  signedRadiusUm: number,
): TidyBendOperator {
  const { nx, ny } = grid;
  const k0 = 2 * Math.PI / wavelengthUm;
  const horizontalEdges = ny * (nx + 1);
  const verticalEdges = (ny + 1) * nx;
  const size = horizontalEdges + verticalEdges;
  const derivatives = derivativeMatrices(grid);
  const tCells = repeatedMetric(grid.x, ny, signedRadiusUm);
  const tVerticalEdges = repeatedMetric(grid.x, ny + 1, signedRadiusUm);
  const tHorizontalEdges = repeatedMetric(grid.xNodes, ny, signedRadiusUm);
  const tNodes = repeatedMetric(grid.xNodes, ny + 1, signedRadiusUm);
  const inverseEpsilonZ = Array.from(grid.inverseEpsilonZ, (value, index) => numeric(value, grid.inverseEpsilonZImaginary[index]));
  const epsilonX = Array.from(grid.epsilonX, (value, index) => numeric(value, grid.epsilonXImaginary[index]));
  const epsilonY = Array.from(grid.epsilonY, (value, index) => numeric(value, grid.epsilonYImaginary[index]));

  // Radial material transformation followed by Tidy3D's reduced P Q E_t = beta^2 E_t formulation.
  const longitudinalH = horizontal(derivatives.dy, scaleMatrix(derivatives.dx, -1));
  const longitudinalE = horizontal(derivatives.by, scaleMatrix(derivatives.bx, -1));
  const transformedInverseEpsilonZ = diagonal(inverseEpsilonZ.map((value, index) => multiplyNumeric(value, tNodes[index])));
  const pExCurl = scaleMatrix(multiplyMatrices(multiplyMatrices(derivatives.ax, transformedInverseEpsilonZ), longitudinalH), 1 / k0);
  const pEyCurl = scaleMatrix(multiplyMatrices(multiplyMatrices(diagonal(tHorizontalEdges), derivatives.ay), multiplyMatrices(diagonal(inverseEpsilonZ), longitudinalH)), 1 / k0);
  const pExMaterial = horizontal(zero(verticalEdges, horizontalEdges), diagonal(tVerticalEdges.map((value) => multiplyNumeric(value, -k0))));
  const pEyMaterial = horizontal(diagonal(tHorizontalEdges.map((value) => multiplyNumeric(value, k0))), zero(horizontalEdges, verticalEdges));
  const p = vertical(addMatrices(pExCurl, pExMaterial), addMatrices(pEyCurl, pEyMaterial));

  const qHxCurl = scaleMatrix(multiplyMatrices(multiplyMatrices(derivatives.cx, diagonal(tCells)), longitudinalE), -1 / k0);
  const qHyCurl = scaleMatrix(multiplyMatrices(multiplyMatrices(diagonal(tVerticalEdges), derivatives.cy), longitudinalE), -1 / k0);
  const qHxMaterial = horizontal(
    zero(horizontalEdges, verticalEdges),
    diagonal(epsilonY.map((value, index) => multiplyNumeric(value, multiplyNumeric(tHorizontalEdges[index], k0)))),
  );
  const qHyMaterial = horizontal(
    diagonal(epsilonX.map((value, index) => multiplyNumeric(value, multiplyNumeric(tVerticalEdges[index], -k0)))),
    zero(verticalEdges, horizontalEdges),
  );
  const q = vertical(addMatrices(qHxCurl, qHxMaterial), addMatrices(qHyCurl, qHyMaterial));
  const operatorMatrix = multiplyMatrices(p, q);
  const operatorSparse = toSparseJson(operatorMatrix);
  const qSparse = toSparseJson(q);
  const isComplex = operatorSparse.values.some((value) => Math.abs(imaginaryPart(value)) > 1e-15);
  const operatorReal = Float64Array.from(operatorSparse.values, realPart);
  const operatorImaginary = Float64Array.from(operatorSparse.values, imaginaryPart);
  const zeroRightHandSide = new Float64Array(size);
  let factorizationShift = Number.NaN;

  const applyParts = (real: Float64Array, imaginary: Float64Array) => multiplySparse(operatorSparse, real, imaginary);
  const apply = (vector: Float64Array): Float64Array => {
    const real = isComplex ? vector.subarray(0, size) : vector;
    const imaginary = isComplex ? vector.subarray(size) : new Float64Array(size);
    const output = applyParts(real, imaginary);
    if (!isComplex) return output.real;
    const joined = new Float64Array(2 * size);
    joined.set(output.real);
    joined.set(output.imaginary, size);
    return joined;
  };

  const solveShifted = (shift: number, rightHandSide: Float64Array): Float64Array => {
    if (shift !== factorizationShift) {
      factorizeSparseLu(size, operatorSparse.ptr, operatorSparse.index, operatorReal, operatorImaginary, shift);
      factorizationShift = shift;
    }
    const solved = solveSparseLu(
      rightHandSide.subarray(0, size),
      isComplex ? rightHandSide.subarray(size) : zeroRightHandSide,
    );
    const output = new Float64Array(isComplex ? 2 * size : size);
    output.set(solved.real);
    if (isComplex) output.set(solved.imaginary, size);
    const shiftedProduct = apply(output);
    for (let index = 0; index < shiftedProduct.length; index += 1) shiftedProduct[index] -= shift * output[index];
    let residualSquared = 0;
    let rightHandSideSquared = 0;
    for (let index = 0; index < shiftedProduct.length; index += 1) {
      residualSquared += (shiftedProduct[index] - rightHandSide[index]) ** 2;
      rightHandSideSquared += rightHandSide[index] ** 2;
    }
    const relativeResidual = Math.sqrt(residualSquared / Math.max(rightHandSideSquared, 1e-30));
    if (!Number.isFinite(relativeResidual) || relativeResidual > 1e-7) {
      throw new Error(`Sparse bend solve did not converge (relative residual ${relativeResidual.toExponential(2)}).`);
    }
    return output;
  };

  return {
    size,
    complex: isComplex,
    apply,
    solveShifted,
    reconstructMagnetic(electricReal, electricImaginary, betaReal, betaImaginary) {
      return divideComplexVector(multiplySparse(qSparse, electricReal, electricImaginary), betaReal, betaImaginary);
    },
  };
}
