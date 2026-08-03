export interface RustEigenpair {
  eigenvalue: number;
  eigenvalueImaginary: number;
  residual: number;
  conditionEstimate: number;
  vector: Float64Array;
  vectorImaginary?: Float64Array;
}

interface ModeSolverCoreExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  allocate_f64(length: number): number;
  deallocate_f64(pointer: number, capacity: number): void;
  allocate_u32(length: number): number;
  deallocate_u32(pointer: number, capacity: number): void;
  configure_vector_operator(...parameters: number[]): number;
  configure_tensor_operator(...parameters: number[]): number;
  configure_sparse_operator(size: number, pointers: number, indices: number, real: number, imaginary: number, nonzeros: number): number;
  operator_physical_size(): number;
  operator_vector_size(): number;
  operator_is_complex(): number;
  apply_operator(input: number, inputLength: number, output: number, outputLength: number): number;
  solve_shifted_operator(shift: number, input: number, inputLength: number, output: number, outputLength: number): number;
  solve_eigenpairs(shift: number, arnoldiDimension: number, requestedPairs: number, initialVector: number, initialVectorLength: number): number;
  eigenpair_count(): number;
  eigenpair_stride(): number;
  copy_eigenpair(index: number, output: number, outputLength: number): number;
}

const wasmUrl = new URL("./mode_solver_core.wasm", import.meta.url);
const isNode = Boolean((globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node);
const nodeFsModule = "node:fs/promises";
const module = await WebAssembly.compile(isNode
  ? await (await import(/* @vite-ignore */ nodeFsModule)).readFile(wasmUrl)
  : await (await fetch(wasmUrl)).arrayBuffer());
const { exports } = await WebAssembly.instantiate(module, {});
const wasm = exports as ModeSolverCoreExports;

export function configureVectorOperator(
  nx: number,
  ny: number,
  k0: number,
  periodicX: boolean,
  blochPhaseXRad: number,
  periodicY: boolean,
  blochPhaseYRad: number,
  arrays: readonly Float64Array[],
): void {
  if (arrays.length !== 18) throw new Error("The vector operator requires 18 coefficient arrays.");
  withF64Arrays(arrays, (pointers) => checkStatus(wasm.configure_vector_operator(
    nx, ny, k0, periodicX ? 1 : 0, blochPhaseXRad, periodicY ? 1 : 0, blochPhaseYRad, ...pointers,
  ), "configure vector operator"));
}

export function configureTensorOperator(
  nx: number,
  ny: number,
  k0: number,
  arrays: readonly Float64Array[],
): void {
  if (arrays.length !== 10) throw new Error("The tensor operator requires 10 coefficient arrays.");
  withF64Arrays(arrays, (pointers) => checkStatus(wasm.configure_tensor_operator(nx, ny, k0, ...pointers), "configure tensor operator"));
}

export function configureSparseOperator(
  size: number,
  columnPointers: number[],
  rowIndices: number[],
  valuesReal: Float64Array,
  valuesImaginary: Float64Array,
): void {
  const integerLength = columnPointers.length + rowIndices.length;
  const integerPointer = wasm.allocate_u32(integerLength);
  const valuePointer = wasm.allocate_f64(2 * valuesReal.length);
  try {
    const integers = new Uint32Array(wasm.memory.buffer, integerPointer, integerLength);
    integers.set(columnPointers);
    integers.set(rowIndices, columnPointers.length);
    const values = new Float64Array(wasm.memory.buffer, valuePointer, 2 * valuesReal.length);
    values.set(valuesReal);
    values.set(valuesImaginary, valuesReal.length);
    checkStatus(wasm.configure_sparse_operator(
      size,
      integerPointer,
      integerPointer + 4 * columnPointers.length,
      valuePointer,
      valuePointer + 8 * valuesReal.length,
      rowIndices.length,
    ), "configure sparse operator");
  } finally {
    wasm.deallocate_f64(valuePointer, 2 * valuesReal.length);
    wasm.deallocate_u32(integerPointer, integerLength);
  }
}

export function applyConfiguredOperator(input: Float64Array): Float64Array {
  const expectedLength = wasm.operator_vector_size();
  if (input.length !== expectedLength) throw new RangeError(`The operator expects ${expectedLength} values.`);
  const pointer = wasm.allocate_f64(2 * input.length);
  try {
    new Float64Array(wasm.memory.buffer, pointer, input.length).set(input);
    checkStatus(wasm.apply_operator(pointer, input.length, pointer + 8 * input.length, input.length), "apply operator");
    return new Float64Array(wasm.memory.buffer, pointer + 8 * input.length, input.length).slice();
  } finally {
    wasm.deallocate_f64(pointer, 2 * input.length);
  }
}

export function solveConfiguredShifted(shift: number, rightHandSide: Float64Array): Float64Array {
  const expectedLength = wasm.operator_vector_size();
  if (rightHandSide.length !== expectedLength) throw new RangeError(`The operator expects ${expectedLength} values.`);
  const pointer = wasm.allocate_f64(2 * rightHandSide.length);
  try {
    new Float64Array(wasm.memory.buffer, pointer, rightHandSide.length).set(rightHandSide);
    checkStatus(wasm.solve_shifted_operator(shift, pointer, rightHandSide.length, pointer + 8 * rightHandSide.length, rightHandSide.length), "solve shifted system");
    return new Float64Array(wasm.memory.buffer, pointer + 8 * rightHandSide.length, rightHandSide.length).slice();
  } finally {
    wasm.deallocate_f64(pointer, 2 * rightHandSide.length);
  }
}

export function solveConfiguredEigenpairs(
  shift: number,
  arnoldiDimension: number,
  requestedPairs: number,
  initialVector: Float64Array,
): RustEigenpair[] {
  const inputPointer = wasm.allocate_f64(initialVector.length);
  try {
    new Float64Array(wasm.memory.buffer, inputPointer, initialVector.length).set(initialVector);
    checkStatus(wasm.solve_eigenpairs(shift, arnoldiDimension, requestedPairs, inputPointer, initialVector.length), "solve eigenpairs");
  } finally {
    wasm.deallocate_f64(inputPointer, initialVector.length);
  }
  const count = wasm.eigenpair_count();
  const stride = wasm.eigenpair_stride();
  const physicalSize = wasm.operator_physical_size();
  const complex = wasm.operator_is_complex() !== 0;
  const outputPointer = wasm.allocate_f64(stride);
  try {
    const pairs: RustEigenpair[] = [];
    for (let index = 0; index < count; index += 1) {
      checkStatus(wasm.copy_eigenpair(index, outputPointer, stride), "copy eigenpair");
      const output = new Float64Array(wasm.memory.buffer, outputPointer, stride);
      pairs.push({
        eigenvalue: output[0],
        eigenvalueImaginary: output[1],
        residual: output[2],
        conditionEstimate: output[3],
        vector: output.slice(4, 4 + physicalSize),
        ...(complex ? { vectorImaginary: output.slice(4 + physicalSize) } : {}),
      });
    }
    return pairs;
  } finally {
    wasm.deallocate_f64(outputPointer, stride);
  }
}

function withF64Arrays(arrays: readonly Float64Array[], callback: (pointers: number[]) => void): void {
  const totalLength = arrays.reduce((total, array) => total + array.length, 0);
  const pointer = wasm.allocate_f64(totalLength);
  try {
    const memory = new Float64Array(wasm.memory.buffer, pointer, totalLength);
    const pointers: number[] = [];
    let offset = 0;
    for (const array of arrays) {
      memory.set(array, offset);
      pointers.push(pointer + 8 * offset);
      offset += array.length;
    }
    callback(pointers);
  } finally {
    wasm.deallocate_f64(pointer, totalLength);
  }
}

function checkStatus(status: number, operation: string): void {
  if (status !== 0) throw new Error(`Rust/WASM failed to ${operation} (status ${status}).`);
}
