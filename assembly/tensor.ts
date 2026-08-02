let nx = 0;
let ny = 0;
let k0 = 0.0;
let dxCell = new Float64Array(0);
let dyCell = new Float64Array(0);
let dxDual = new Float64Array(0);
let dyDual = new Float64Array(0);
let epsilonX = new Float64Array(0);
let epsilonY = new Float64Array(0);
let epsilonXY = new Float64Array(0);
let epsilonXZAtNodes = new Float64Array(0);
let epsilonYZAtNodes = new Float64Array(0);
let epsilonZAtNodes = new Float64Array(0);
let epsilonXZAtEx = new Float64Array(0);
let epsilonYZAtEy = new Float64Array(0);

export const Float64Array_ID = idof<Float64Array>();

@inline
function cell(row: i32, column: i32): i32 {
  return row * nx + column;
}

@inline
function clamp(value: i32, minimum: i32, maximum: i32): i32 {
  return min(max(value, minimum), maximum);
}

export function configureTensorOperator(
  nextNx: i32,
  nextNy: i32,
  nextK0: f64,
  nextDxCell: Float64Array,
  nextDyCell: Float64Array,
  nextDxDual: Float64Array,
  nextDyDual: Float64Array,
  epsilonXXCell: Float64Array,
  epsilonYYCell: Float64Array,
  epsilonZZCell: Float64Array,
  epsilonXYCell: Float64Array,
  epsilonXZCell: Float64Array,
  epsilonYZCell: Float64Array,
): i32 {
  nx = nextNx;
  ny = nextNy;
  k0 = nextK0;
  dxCell = nextDxCell;
  dyCell = nextDyCell;
  dxDual = nextDxDual;
  dyDual = nextDyDual;
  epsilonXY = epsilonXYCell;
  epsilonX = new Float64Array((ny + 1) * nx);
  epsilonY = new Float64Array(ny * (nx + 1));
  epsilonXZAtEx = new Float64Array((ny + 1) * nx);
  epsilonYZAtEy = new Float64Array(ny * (nx + 1));
  epsilonXZAtNodes = new Float64Array((ny + 1) * (nx + 1));
  epsilonYZAtNodes = new Float64Array((ny + 1) * (nx + 1));
  epsilonZAtNodes = new Float64Array((ny + 1) * (nx + 1));

  for (let row = 0; row <= ny; row += 1) {
    const south = clamp(row - 1, 0, ny - 1);
    const north = clamp(row, 0, ny - 1);
    for (let column = 0; column < nx; column += 1) {
      const edge = row * nx + column;
      epsilonX[edge] = 0.5 * (epsilonXXCell[cell(south, column)] + epsilonXXCell[cell(north, column)]);
      epsilonXZAtEx[edge] = 0.5 * (epsilonXZCell[cell(south, column)] + epsilonXZCell[cell(north, column)]);
    }
  }
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = clamp(column - 1, 0, nx - 1);
      const east = clamp(column, 0, nx - 1);
      const edge = row * (nx + 1) + column;
      epsilonY[edge] = 0.5 * (epsilonYYCell[cell(row, west)] + epsilonYYCell[cell(row, east)]);
      epsilonYZAtEy[edge] = 0.5 * (epsilonYZCell[cell(row, west)] + epsilonYZCell[cell(row, east)]);
    }
  }
  for (let row = 0; row <= ny; row += 1) {
    const south = clamp(row - 1, 0, ny - 1);
    const north = clamp(row, 0, ny - 1);
    for (let column = 0; column <= nx; column += 1) {
      const west = clamp(column - 1, 0, nx - 1);
      const east = clamp(column, 0, nx - 1);
      const node = row * (nx + 1) + column;
      const southwest = cell(south, west);
      const southeast = cell(south, east);
      const northwest = cell(north, west);
      const northeast = cell(north, east);
      epsilonZAtNodes[node] = 0.25 * (epsilonZZCell[southwest] + epsilonZZCell[southeast] + epsilonZZCell[northwest] + epsilonZZCell[northeast]);
      epsilonXZAtNodes[node] = 0.25 * (epsilonXZCell[southwest] + epsilonXZCell[southeast] + epsilonXZCell[northwest] + epsilonXZCell[northeast]);
      epsilonYZAtNodes[node] = 0.25 * (epsilonYZCell[southwest] + epsilonYZCell[southeast] + epsilonYZCell[northwest] + epsilonYZCell[northeast]);
    }
  }
  return 2 * (ny * (nx + 1) + (ny + 1) * nx);
}

export function applyTensorOperator(input: Float64Array): Float64Array {
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const physicalSize = 2 * (hxSize + hySize);
  assert(input.length == physicalSize);
  const output = new Float64Array(physicalSize);
  const exOffset = 0;
  const eyOffset = hySize;
  const hxOffset = hySize + hxSize;
  const hyOffset = hySize + 2 * hxSize;
  const outputExOffset = 0;
  const outputEyOffset = hySize;
  const outputHxOffset = hySize + hxSize;
  const outputHyOffset = hySize + 2 * hxSize;
  const exCell = new Float64Array(nx * ny);
  const eyCell = new Float64Array(nx * ny);
  const exNode = new Float64Array((nx + 1) * (ny + 1));
  const eyNode = new Float64Array((nx + 1) * (ny + 1));
  const ezNode = new Float64Array((nx + 1) * (ny + 1));
  const longitudinalE = new Float64Array(nx * ny);

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cell(row, column);
      exCell[index] = 0.5 * (input[exOffset + row * nx + column] + input[exOffset + (row + 1) * nx + column]);
      eyCell[index] = 0.5 * (input[eyOffset + row * (nx + 1) + column] + input[eyOffset + row * (nx + 1) + column + 1]);
      longitudinalE[index] = (
        input[exOffset + (row + 1) * nx + column] - input[exOffset + row * nx + column]
      ) / dyCell[row] - (
        input[eyOffset + row * (nx + 1) + column + 1] - input[eyOffset + row * (nx + 1) + column]
      ) / dxCell[column];
    }
  }

  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const node = row * (nx + 1) + column;
      const westEx = input[exOffset + row * nx + clamp(column - 1, 0, nx - 1)];
      const eastEx = input[exOffset + row * nx + clamp(column, 0, nx - 1)];
      const southEy = input[eyOffset + clamp(row - 1, 0, ny - 1) * (nx + 1) + column];
      const northEy = input[eyOffset + clamp(row, 0, ny - 1) * (nx + 1) + column];
      exNode[node] = 0.5 * (westEx + eastEx);
      eyNode[node] = 0.5 * (southEy + northEy);
      const southHx = row > 0 ? input[hxOffset + (row - 1) * (nx + 1) + column] : 0.0;
      const northHx = row < ny ? input[hxOffset + row * (nx + 1) + column] : 0.0;
      const westHy = column > 0 ? input[hyOffset + row * nx + column - 1] : 0.0;
      const eastHy = column < nx ? input[hyOffset + row * nx + column] : 0.0;
      const displacementZ = (northHx - southHx) / dyDual[row] - (eastHy - westHy) / dxDual[column];
      ezNode[node] = (displacementZ - epsilonXZAtNodes[node] * exNode[node] - epsilonYZAtNodes[node] * eyNode[node]) / epsilonZAtNodes[node];
    }
  }

  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const edge = row * nx + column;
      output[outputExOffset + edge] = (ezNode[row * (nx + 1) + column + 1] - ezNode[row * (nx + 1) + column]) / (k0 * dxCell[column]) - k0 * input[hyOffset + edge];
      const south = cell(clamp(row - 1, 0, ny - 1), column);
      const north = cell(clamp(row, 0, ny - 1), column);
      const crossY = 0.5 * (epsilonXY[south] * eyCell[south] + epsilonXY[north] * eyCell[north]);
      const ezAtEx = 0.5 * (ezNode[row * (nx + 1) + column] + ezNode[row * (nx + 1) + column + 1]);
      const displacementX = epsilonX[edge] * input[exOffset + edge] + crossY + epsilonXZAtEx[edge] * ezAtEx;
      const southLongitudinal = row > 0 ? longitudinalE[cell(row - 1, column)] : 0.0;
      const northLongitudinal = row < ny ? longitudinalE[cell(row, column)] : 0.0;
      output[outputHyOffset + edge] = -(northLongitudinal - southLongitudinal) / (k0 * dyDual[row]) - k0 * displacementX;
    }
  }

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const edge = row * (nx + 1) + column;
      output[outputEyOffset + edge] = (ezNode[(row + 1) * (nx + 1) + column] - ezNode[row * (nx + 1) + column]) / (k0 * dyCell[row]) + k0 * input[hxOffset + edge];
      const west = cell(row, clamp(column - 1, 0, nx - 1));
      const east = cell(row, clamp(column, 0, nx - 1));
      const crossX = 0.5 * (epsilonXY[west] * exCell[west] + epsilonXY[east] * exCell[east]);
      const ezAtEy = 0.5 * (ezNode[row * (nx + 1) + column] + ezNode[(row + 1) * (nx + 1) + column]);
      const displacementY = epsilonY[edge] * input[eyOffset + edge] + crossX + epsilonYZAtEy[edge] * ezAtEy;
      const westLongitudinal = column > 0 ? longitudinalE[cell(row, column - 1)] : 0.0;
      const eastLongitudinal = column < nx ? longitudinalE[cell(row, column)] : 0.0;
      output[outputHxOffset + edge] = -(eastLongitudinal - westLongitudinal) / (k0 * dxDual[column]) + k0 * displacementY;
    }
  }
  return output;
}

@inline
function dot(first: Float64Array, second: Float64Array): f64 {
  let sum = 0.0;
  for (let index = 0; index < first.length; index += 1) sum += first[index] * second[index];
  return sum;
}

@inline
function norm(values: Float64Array): f64 {
  return Math.sqrt(dot(values, values));
}

@inline
function addScaled(target: Float64Array, source: Float64Array, factor: f64): void {
  for (let index = 0; index < target.length; index += 1) target[index] += factor * source[index];
}

function applyShifted(vector: Float64Array, shift: f64): Float64Array {
  const output = applyTensorOperator(vector);
  addScaled(output, vector, -shift);
  return output;
}

export function solveShiftedTensorSystem(
  rightHandSide: Float64Array,
  shift: f64,
  maximumIterations: i32 = 180,
  relativeTolerance: f64 = 1e-5,
): Float64Array {
  const size = rightHandSide.length;
  const solution = new Float64Array(size);
  let residual = rightHandSide.slice();
  const shadow = residual.slice();
  const direction = new Float64Array(size);
  let operatorDirection = new Float64Array(size);
  let rhoPrevious = 1.0;
  let alpha = 1.0;
  let omega = 1.0;
  const tolerance = relativeTolerance * max(norm(rightHandSide), 1.0);

  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const rho = dot(shadow, residual);
    if (Math.abs(rho) < 1e-30) break;
    const beta = (rho / rhoPrevious) * (alpha / omega);
    for (let index = 0; index < size; index += 1) {
      direction[index] = residual[index] + beta * (direction[index] - omega * operatorDirection[index]);
    }
    operatorDirection = applyShifted(direction, shift);
    const denominator = dot(shadow, operatorDirection);
    if (Math.abs(denominator) < 1e-30) break;
    alpha = rho / denominator;
    const intermediate = residual.slice();
    addScaled(intermediate, operatorDirection, -alpha);
    if (norm(intermediate) <= tolerance) {
      addScaled(solution, direction, alpha);
      return solution;
    }
    const operatorIntermediate = applyShifted(intermediate, shift);
    const omegaDenominator = dot(operatorIntermediate, operatorIntermediate);
    if (omegaDenominator < 1e-30) break;
    omega = dot(operatorIntermediate, intermediate) / omegaDenominator;
    addScaled(solution, direction, alpha);
    addScaled(solution, intermediate, omega);
    residual = intermediate;
    addScaled(residual, operatorIntermediate, -omega);
    if (norm(residual) <= tolerance) return solution;
    if (Math.abs(omega) < 1e-30) break;
    rhoPrevious = rho;
  }
  return solution;
}
