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
let inverseEpsilonZ = new Float64Array(0);
let vectorDivergence = new Float64Array(0);
let vectorCurl = new Float64Array(0);
let vectorAxCurl = new Float64Array(0);
let vectorAyCurl = new Float64Array(0);
let vectorSolution = new Float64Array(0);
let vectorResidual = new Float64Array(0);
let vectorShadow = new Float64Array(0);
let vectorDirection = new Float64Array(0);
let vectorOperatorDirection = new Float64Array(0);
let vectorOperatorIntermediate = new Float64Array(0);
let vectorIntermediate = new Float64Array(0);

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

export function configureVectorOperator(
  nextNx: i32,
  nextNy: i32,
  nextK0: f64,
  nextDxCell: Float64Array,
  nextDyCell: Float64Array,
  nextDxDual: Float64Array,
  nextDyDual: Float64Array,
  nextEpsilonX: Float64Array,
  nextEpsilonY: Float64Array,
  nextInverseEpsilonZ: Float64Array,
): i32 {
  nx = nextNx;
  ny = nextNy;
  k0 = nextK0;
  dxCell = nextDxCell;
  dyCell = nextDyCell;
  dxDual = nextDxDual;
  dyDual = nextDyDual;
  epsilonX = nextEpsilonX;
  epsilonY = nextEpsilonY;
  inverseEpsilonZ = nextInverseEpsilonZ;
  vectorDivergence = new Float64Array(nx * ny);
  vectorCurl = new Float64Array((nx + 1) * (ny + 1));
  vectorAxCurl = new Float64Array((ny + 1) * nx);
  vectorAyCurl = new Float64Array(ny * (nx + 1));
  const size = ny * (nx + 1) + (ny + 1) * nx;
  vectorSolution = new Float64Array(size);
  vectorResidual = new Float64Array(size);
  vectorShadow = new Float64Array(size);
  vectorDirection = new Float64Array(size);
  vectorOperatorDirection = new Float64Array(size);
  vectorOperatorIntermediate = new Float64Array(size);
  vectorIntermediate = new Float64Array(size);
  return size;
}

function applyVectorOperatorInto(input: Float64Array, output: Float64Array): void {
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const divergence = vectorDivergence;
  const curl = vectorCurl;
  const axCurl = vectorAxCurl;
  const ayCurl = vectorAyCurl;
  const inverseK0Squared = 1.0 / (k0 * k0);

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cell(row, column);
      divergence[index] = (
        input[row * (nx + 1) + column + 1] - input[row * (nx + 1) + column]
      ) / dxCell[column] + (
        input[hxSize + (row + 1) * nx + column] - input[hxSize + row * nx + column]
      ) / dyCell[row];
    }
  }
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = row > 0 ? input[(row - 1) * (nx + 1) + column] : 0.0;
      const north = row < ny ? input[row * (nx + 1) + column] : 0.0;
      const west = column > 0 ? input[hxSize + row * nx + column - 1] : 0.0;
      const east = column < nx ? input[hxSize + row * nx + column] : 0.0;
      const index = row * (nx + 1) + column;
      curl[index] = ((north - south) / dyDual[row] - (east - west) / dxDual[column]) * inverseEpsilonZ[index];
    }
  }
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      axCurl[row * nx + column] = (curl[row * (nx + 1) + column + 1] - curl[row * (nx + 1) + column]) / dxCell[column];
    }
  }
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      ayCurl[row * (nx + 1) + column] = (curl[(row + 1) * (nx + 1) + column] - curl[row * (nx + 1) + column]) / dyCell[row];
    }
  }
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cell(row, column);
      divergence[index] += inverseK0Squared * (
        (ayCurl[row * (nx + 1) + column + 1] - ayCurl[row * (nx + 1) + column]) / dxCell[column]
        - (axCurl[(row + 1) * nx + column] - axCurl[row * nx + column]) / dyCell[row]
      );
    }
  }

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? divergence[cell(row, column - 1)] : 0.0;
      const east = column < nx ? divergence[cell(row, column)] : 0.0;
      const index = row * (nx + 1) + column;
      output[index] = (east - west) / dxDual[column]
        + epsilonY[index] * ayCurl[index] + k0 * k0 * epsilonY[index] * input[index];
    }
  }
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = row > 0 ? divergence[cell(row - 1, column)] : 0.0;
      const north = row < ny ? divergence[cell(row, column)] : 0.0;
      const edge = row * nx + column;
      output[hxSize + edge] = (north - south) / dyDual[row]
        - epsilonX[edge] * axCurl[edge] + k0 * k0 * epsilonX[edge] * input[hxSize + edge];
    }
  }
}

export function applyVectorOperator(input: Float64Array): Float64Array {
  const output = new Float64Array(ny * (nx + 1) + (ny + 1) * nx);
  applyVectorOperatorInto(input, output);
  return output;
}

function applyShiftedVectorInto(vector: Float64Array, shift: f64, output: Float64Array): void {
  applyVectorOperatorInto(vector, output);
  addScaled(output, vector, -shift);
}

function diagonalPreconditionVector(vector: Float64Array, shift: f64): Float64Array {
  const hxSize = ny * (nx + 1);
  const output = new Float64Array(vector.length);
  const floor = 0.1 * k0 * k0;
  for (let index = 0; index < hxSize; index += 1) {
    const diagonal = k0 * k0 * epsilonY[index] - shift;
    output[index] = vector[index] / (Math.abs(diagonal) > floor ? diagonal : (diagonal < 0.0 ? -floor : floor));
  }
  for (let index = 0; index < vector.length - hxSize; index += 1) {
    const diagonal = k0 * k0 * epsilonX[index] - shift;
    output[hxSize + index] = vector[hxSize + index] / (Math.abs(diagonal) > floor ? diagonal : (diagonal < 0.0 ? -floor : floor));
  }
  return output;
}

export function solveShiftedVectorSystem(
  rightHandSide: Float64Array,
  shift: f64,
  maximumIterations: i32 = 180,
  relativeTolerance: f64 = 1e-5,
): Float64Array {
  const size = rightHandSide.length;
  const solution = vectorSolution;
  let residual = vectorResidual;
  const shadow = vectorShadow;
  const direction = vectorDirection;
  const operatorDirection = vectorOperatorDirection;
  const operatorIntermediate = vectorOperatorIntermediate;
  let intermediate = vectorIntermediate;
  solution.fill(0.0);
  direction.fill(0.0);
  operatorDirection.fill(0.0);
  residual.set(rightHandSide);
  shadow.set(rightHandSide);
  let rhoPrevious = 1.0;
  let alpha = 1.0;
  let omega = 1.0;
  let usePreconditioner = false;
  const tolerance = relativeTolerance * max(norm(rightHandSide), 1.0);

  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const rho = dot(shadow, residual);
    if (Math.abs(rho) < 1e-30) break;
    const beta = (rho / rhoPrevious) * (alpha / omega);
    updateBiCgStabDirection(direction, residual, operatorDirection, beta, omega);
    let preconditionedDirection = usePreconditioner ? diagonalPreconditionVector(direction, shift) : direction;
    if (iteration == 0 && nx <= 64 && ny <= 64) {
      const diagonalDirection = diagonalPreconditionVector(direction, shift);
      applyShiftedVectorInto(direction, shift, operatorDirection);
      applyShiftedVectorInto(diagonalDirection, shift, operatorIntermediate);
      const rawDenominator = dot(shadow, operatorDirection);
      const diagonalDenominator = dot(shadow, operatorIntermediate);
      if (Math.abs(rawDenominator) > 1e-30 && Math.abs(diagonalDenominator) > 1e-30) {
        subtractScaledInto(intermediate, residual, operatorDirection, rho / rawDenominator);
        subtractScaledInto(solution, residual, operatorIntermediate, rho / diagonalDenominator);
        usePreconditioner = norm(solution) < 0.5 * norm(intermediate);
      }
      preconditionedDirection = usePreconditioner ? diagonalDirection : direction;
      if (usePreconditioner) operatorDirection.set(operatorIntermediate);
      solution.fill(0.0);
    } else applyShiftedVectorInto(preconditionedDirection, shift, operatorDirection);
    const denominator = dot(shadow, operatorDirection);
    if (Math.abs(denominator) < 1e-30) break;
    alpha = rho / denominator;
    subtractScaledInto(intermediate, residual, operatorDirection, alpha);
    if (norm(intermediate) <= tolerance) {
      addScaled(solution, preconditionedDirection, alpha);
      return solution;
    }
    const preconditionedIntermediate = usePreconditioner ? diagonalPreconditionVector(intermediate, shift) : intermediate;
    applyShiftedVectorInto(preconditionedIntermediate, shift, operatorIntermediate);
    const omegaDenominator = dot(operatorIntermediate, operatorIntermediate);
    if (omegaDenominator < 1e-30) break;
    omega = dot(operatorIntermediate, intermediate) / omegaDenominator;
    addScaled(solution, preconditionedDirection, alpha);
    addScaled(solution, preconditionedIntermediate, omega);
    subtractScaledInto(intermediate, intermediate, operatorIntermediate, omega);
    const previousResidual = residual;
    residual = intermediate;
    intermediate = previousResidual;
    if (norm(residual) <= tolerance) return solution;
    if (Math.abs(omega) < 1e-30) break;
    rhoPrevious = rho;
  }
  return solution;
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
  let index = 0;
  let packed = f64x2(0.0, 0.0);
  for (; index + 1 < first.length; index += 2) {
    packed = v128.add<f64>(packed, v128.mul<f64>(
      v128.load(first.dataStart + (<usize>index << 3)),
      v128.load(second.dataStart + (<usize>index << 3)),
    ));
  }
  let sum = v128.extract_lane<f64>(packed, 0) + v128.extract_lane<f64>(packed, 1);
  if (index < first.length) sum += first[index] * second[index];
  return sum;
}

@inline
function norm(values: Float64Array): f64 {
  return Math.sqrt(dot(values, values));
}

@inline
function addScaled(target: Float64Array, source: Float64Array, factor: f64): void {
  let index = 0;
  const packedFactor = v128.splat<f64>(factor);
  for (; index + 1 < target.length; index += 2) {
    const address = target.dataStart + (<usize>index << 3);
    v128.store(address, v128.add<f64>(v128.load(address), v128.mul<f64>(
      packedFactor, v128.load(source.dataStart + (<usize>index << 3)),
    )));
  }
  if (index < target.length) target[index] += factor * source[index];
}

@inline
function subtractScaledInto(output: Float64Array, first: Float64Array, second: Float64Array, factor: f64): void {
  let index = 0;
  const packedFactor = v128.splat<f64>(factor);
  for (; index + 1 < output.length; index += 2) {
    v128.store(output.dataStart + (<usize>index << 3), v128.sub<f64>(
      v128.load(first.dataStart + (<usize>index << 3)),
      v128.mul<f64>(packedFactor, v128.load(second.dataStart + (<usize>index << 3))),
    ));
  }
  if (index < output.length) output[index] = first[index] - factor * second[index];
}

@inline
function updateBiCgStabDirection(
  direction: Float64Array, residual: Float64Array, operatorDirection: Float64Array, beta: f64, omega: f64,
): void {
  let index = 0;
  const packedBeta = v128.splat<f64>(beta);
  const packedOmega = v128.splat<f64>(omega);
  for (; index + 1 < direction.length; index += 2) {
    const address = direction.dataStart + (<usize>index << 3);
    v128.store(address, v128.add<f64>(
      v128.load(residual.dataStart + (<usize>index << 3)),
      v128.mul<f64>(packedBeta, v128.sub<f64>(v128.load(address), v128.mul<f64>(
        packedOmega, v128.load(operatorDirection.dataStart + (<usize>index << 3)),
      ))),
    ));
  }
  if (index < direction.length) direction[index] = residual[index] + beta * (direction[index] - omega * operatorDirection[index]);
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
