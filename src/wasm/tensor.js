async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.setPrototypeOf({
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0);
        fileName = __liftString(fileName >>> 0);
        lineNumber = lineNumber >>> 0;
        columnNumber = columnNumber >>> 0;
        (() => {
          // @external.js
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        })();
      },
    }, Object.assign(Object.create(globalThis), imports.env || {})),
  };
  const { exports } = await WebAssembly.instantiate(module, adaptedImports);
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    Float64Array_ID: {
      // assembly/tensor/Float64Array_ID: u32
      valueOf() { return this.value; },
      get value() {
        return exports.Float64Array_ID.value >>> 0;
      }
    },
    configureTensorOperator(nextNx, nextNy, nextK0, nextDxCell, nextDyCell, nextDxDual, nextDyDual, epsilonXXCell, epsilonYYCell, epsilonZZCell, epsilonXYCell, epsilonXZCell, epsilonYZCell) {
      // assembly/tensor/configureTensorOperator(i32, i32, f64, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array) => i32
      nextDxCell = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDxCell) || __notnull());
      nextDyCell = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDyCell) || __notnull());
      nextDxDual = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDxDual) || __notnull());
      nextDyDual = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDyDual) || __notnull());
      epsilonXXCell = __retain(__lowerTypedArray(Float64Array, 4, 3, epsilonXXCell) || __notnull());
      epsilonYYCell = __retain(__lowerTypedArray(Float64Array, 4, 3, epsilonYYCell) || __notnull());
      epsilonZZCell = __retain(__lowerTypedArray(Float64Array, 4, 3, epsilonZZCell) || __notnull());
      epsilonXYCell = __retain(__lowerTypedArray(Float64Array, 4, 3, epsilonXYCell) || __notnull());
      epsilonXZCell = __retain(__lowerTypedArray(Float64Array, 4, 3, epsilonXZCell) || __notnull());
      epsilonYZCell = __lowerTypedArray(Float64Array, 4, 3, epsilonYZCell) || __notnull();
      try {
        return exports.configureTensorOperator(nextNx, nextNy, nextK0, nextDxCell, nextDyCell, nextDxDual, nextDyDual, epsilonXXCell, epsilonYYCell, epsilonZZCell, epsilonXYCell, epsilonXZCell, epsilonYZCell);
      } finally {
        __release(nextDxCell);
        __release(nextDyCell);
        __release(nextDxDual);
        __release(nextDyDual);
        __release(epsilonXXCell);
        __release(epsilonYYCell);
        __release(epsilonZZCell);
        __release(epsilonXYCell);
        __release(epsilonXZCell);
      }
    },
    configureVectorOperator(nextNx, nextNy, nextK0, nextDxCell, nextDyCell, nextDxDual, nextDyDual, nextEpsilonX, nextEpsilonY, nextInverseEpsilonZ) {
      // assembly/tensor/configureVectorOperator(i32, i32, f64, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array, ~lib/typedarray/Float64Array) => i32
      nextDxCell = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDxCell) || __notnull());
      nextDyCell = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDyCell) || __notnull());
      nextDxDual = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDxDual) || __notnull());
      nextDyDual = __retain(__lowerTypedArray(Float64Array, 4, 3, nextDyDual) || __notnull());
      nextEpsilonX = __retain(__lowerTypedArray(Float64Array, 4, 3, nextEpsilonX) || __notnull());
      nextEpsilonY = __retain(__lowerTypedArray(Float64Array, 4, 3, nextEpsilonY) || __notnull());
      nextInverseEpsilonZ = __lowerTypedArray(Float64Array, 4, 3, nextInverseEpsilonZ) || __notnull();
      try {
        return exports.configureVectorOperator(nextNx, nextNy, nextK0, nextDxCell, nextDyCell, nextDxDual, nextDyDual, nextEpsilonX, nextEpsilonY, nextInverseEpsilonZ);
      } finally {
        __release(nextDxCell);
        __release(nextDyCell);
        __release(nextDxDual);
        __release(nextDyDual);
        __release(nextEpsilonX);
        __release(nextEpsilonY);
      }
    },
    applyVectorOperator(input) {
      // assembly/tensor/applyVectorOperator(~lib/typedarray/Float64Array) => ~lib/typedarray/Float64Array
      input = __lowerTypedArray(Float64Array, 4, 3, input) || __notnull();
      return __liftTypedArray(Float64Array, exports.applyVectorOperator(input) >>> 0);
    },
    solveShiftedVectorSystem(rightHandSide, shift, maximumIterations, relativeTolerance) {
      // assembly/tensor/solveShiftedVectorSystem(~lib/typedarray/Float64Array, f64, i32?, f64?) => ~lib/typedarray/Float64Array
      rightHandSide = __lowerTypedArray(Float64Array, 4, 3, rightHandSide) || __notnull();
      exports.__setArgumentsLength(arguments.length);
      return __liftTypedArray(Float64Array, exports.solveShiftedVectorSystem(rightHandSide, shift, maximumIterations, relativeTolerance) >>> 0);
    },
    applyTensorOperator(input) {
      // assembly/tensor/applyTensorOperator(~lib/typedarray/Float64Array) => ~lib/typedarray/Float64Array
      input = __lowerTypedArray(Float64Array, 4, 3, input) || __notnull();
      return __liftTypedArray(Float64Array, exports.applyTensorOperator(input) >>> 0);
    },
    solveShiftedTensorSystem(rightHandSide, shift, maximumIterations, relativeTolerance) {
      // assembly/tensor/solveShiftedTensorSystem(~lib/typedarray/Float64Array, f64, i32?, f64?) => ~lib/typedarray/Float64Array
      rightHandSide = __lowerTypedArray(Float64Array, 4, 3, rightHandSide) || __notnull();
      exports.__setArgumentsLength(arguments.length);
      return __liftTypedArray(Float64Array, exports.solveShiftedTensorSystem(rightHandSide, shift, maximumIterations, relativeTolerance) >>> 0);
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __liftTypedArray(constructor, pointer) {
    if (!pointer) return null;
    return new constructor(
      memory.buffer,
      __getU32(pointer + 4),
      __dataview.getUint32(pointer + 8, true) / constructor.BYTES_PER_ELEMENT
    ).slice();
  }
  function __lowerTypedArray(constructor, id, align, values) {
    if (values == null) return 0;
    const
      length = values.length,
      buffer = exports.__pin(exports.__new(length << align, 1)) >>> 0,
      header = exports.__new(12, id) >>> 0;
    __setU32(header + 0, buffer);
    __dataview.setUint32(header + 4, buffer, true);
    __dataview.setUint32(header + 8, length << align, true);
    new constructor(memory.buffer, buffer, length).set(values);
    exports.__unpin(buffer);
    return header;
  }
  const refcounts = new Map();
  function __retain(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount) refcounts.set(pointer, refcount + 1);
      else refcounts.set(exports.__pin(pointer), 1);
    }
    return pointer;
  }
  function __release(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount === 1) exports.__unpin(pointer), refcounts.delete(pointer);
      else if (refcount) refcounts.set(pointer, refcount - 1);
      else throw Error(`invalid refcount '${refcount}' for reference '${pointer}'`);
    }
  }
  function __notnull() {
    throw TypeError("value must not be null");
  }
  let __dataview = new DataView(memory.buffer);
  function __setU32(pointer, value) {
    try {
      __dataview.setUint32(pointer, value, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      __dataview.setUint32(pointer, value, true);
    }
  }
  function __getU32(pointer) {
    try {
      return __dataview.getUint32(pointer, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      return __dataview.getUint32(pointer, true);
    }
  }
  return adaptedExports;
}
export const {
  memory,
  __new,
  __pin,
  __unpin,
  __collect,
  __rtti_base,
  Float64Array_ID,
  configureTensorOperator,
  configureVectorOperator,
  applyVectorOperator,
  solveShiftedVectorSystem,
  applyTensorOperator,
  solveShiftedTensorSystem,
} = await (async url => instantiate(
  await (async () => {
    const isNodeOrBun = typeof process != "undefined" && process.versions != null && (process.versions.node != null || process.versions.bun != null);
    if (isNodeOrBun) { return globalThis.WebAssembly.compile(await (await import("node:fs/promises")).readFile(url)); }
    else { return await globalThis.WebAssembly.compileStreaming(globalThis.fetch(url)); }
  })(), {
  }
))(new URL("tensor.wasm", import.meta.url));
