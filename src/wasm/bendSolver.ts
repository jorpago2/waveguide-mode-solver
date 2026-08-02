interface BendSolverExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  allocate_f64(length: number): number;
  deallocate_f64(pointer: number, capacity: number): void;
  allocate_u32(length: number): number;
  deallocate_u32(pointer: number, capacity: number): void;
  factorize_shifted(size: number, pointers: number, indices: number, real: number, imaginary: number, nonzeros: number, shift: number): number;
  solve_factorized(rightReal: number, rightImaginary: number, outputReal: number, outputImaginary: number, size: number): number;
  clear_factorization(): void;
}

const wasmUrl = new URL("./bend_solver.wasm", import.meta.url);
const isNode = Boolean((globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node);
const nodeFsModule = "node:fs/promises";
const module = await WebAssembly.compile(isNode
  ? await (await import(/* @vite-ignore */ nodeFsModule)).readFile(wasmUrl)
  : await (await fetch(wasmUrl)).arrayBuffer());
const { exports } = await WebAssembly.instantiate(module, {});
const wasm = exports as BendSolverExports;

export function factorizeSparseLu(
  size: number,
  pointers: number[],
  indices: number[],
  valuesReal: Float64Array,
  valuesImaginary: Float64Array,
  shift: number,
): void {
  const integerLength = pointers.length + indices.length;
  const integerPointer = wasm.allocate_u32(integerLength);
  const valuePointer = wasm.allocate_f64(2 * valuesReal.length);
  try {
    const integerMemory = new Uint32Array(wasm.memory.buffer, integerPointer, integerLength);
    integerMemory.set(pointers);
    integerMemory.set(indices, pointers.length);
    const valueMemory = new Float64Array(wasm.memory.buffer, valuePointer, 2 * valuesReal.length);
    valueMemory.set(valuesReal);
    valueMemory.set(valuesImaginary, valuesReal.length);
    const status = wasm.factorize_shifted(
      size,
      integerPointer,
      integerPointer + 4 * pointers.length,
      valuePointer,
      valuePointer + 8 * valuesReal.length,
      indices.length,
      shift,
    );
    if (status !== 0) throw new Error(`Rust sparse LU factorization failed (status ${status}).`);
  } finally {
    wasm.deallocate_f64(valuePointer, 2 * valuesReal.length);
    wasm.deallocate_u32(integerPointer, integerLength);
  }
}

export function solveSparseLu(rightReal: Float64Array, rightImaginary: Float64Array): {
  real: Float64Array;
  imaginary: Float64Array;
} {
  const size = rightReal.length;
  const pointer = wasm.allocate_f64(4 * size);
  try {
    const memory = new Float64Array(wasm.memory.buffer, pointer, 4 * size);
    memory.set(rightReal);
    memory.set(rightImaginary, size);
    const status = wasm.solve_factorized(pointer, pointer + 8 * size, pointer + 16 * size, pointer + 24 * size, size);
    if (status !== 0) throw new Error(`Rust sparse LU solve failed (status ${status}).`);
    return {
      real: memory.slice(2 * size, 3 * size),
      imaginary: memory.slice(3 * size, 4 * size),
    };
  } finally {
    wasm.deallocate_f64(pointer, 4 * size);
  }
}
