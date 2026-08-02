/** Exported memory */
export declare const memory: WebAssembly.Memory;
// Exported runtime interface
export declare function __new(size: number, id: number): number;
export declare function __pin(ptr: number): number;
export declare function __unpin(ptr: number): void;
export declare function __collect(): void;
export declare const __rtti_base: number;
/** assembly/tensor/Float64Array_ID */
export declare const Float64Array_ID: {
  /** @type `u32` */
  get value(): number
};
/**
 * assembly/tensor/configureTensorOperator
 * @param nextNx `i32`
 * @param nextNy `i32`
 * @param nextK0 `f64`
 * @param nextDxCell `~lib/typedarray/Float64Array`
 * @param nextDyCell `~lib/typedarray/Float64Array`
 * @param nextDxDual `~lib/typedarray/Float64Array`
 * @param nextDyDual `~lib/typedarray/Float64Array`
 * @param epsilonXXCell `~lib/typedarray/Float64Array`
 * @param epsilonYYCell `~lib/typedarray/Float64Array`
 * @param epsilonZZCell `~lib/typedarray/Float64Array`
 * @param epsilonXYCell `~lib/typedarray/Float64Array`
 * @param epsilonXZCell `~lib/typedarray/Float64Array`
 * @param epsilonYZCell `~lib/typedarray/Float64Array`
 * @returns `i32`
 */
export declare function configureTensorOperator(nextNx: number, nextNy: number, nextK0: number, nextDxCell: Float64Array, nextDyCell: Float64Array, nextDxDual: Float64Array, nextDyDual: Float64Array, epsilonXXCell: Float64Array, epsilonYYCell: Float64Array, epsilonZZCell: Float64Array, epsilonXYCell: Float64Array, epsilonXZCell: Float64Array, epsilonYZCell: Float64Array): number;
/**
 * assembly/tensor/applyTensorOperator
 * @param input `~lib/typedarray/Float64Array`
 * @returns `~lib/typedarray/Float64Array`
 */
export declare function applyTensorOperator(input: Float64Array): Float64Array;
/**
 * assembly/tensor/solveShiftedTensorSystem
 * @param rightHandSide `~lib/typedarray/Float64Array`
 * @param shift `f64`
 * @param maximumIterations `i32`
 * @param relativeTolerance `f64`
 * @returns `~lib/typedarray/Float64Array`
 */
export declare function solveShiftedTensorSystem(rightHandSide: Float64Array, shift: number, maximumIterations?: number, relativeTolerance?: number): Float64Array;
