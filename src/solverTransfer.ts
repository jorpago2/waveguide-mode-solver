import type { FieldComponent, SolverResult, WaveguideMode } from "./solver";

interface PackedMatrix {
  rows: number;
  columns: number;
  data: Float32Array;
}

type PackedMode = Omit<WaveguideMode, "fields"> & { fields: Record<FieldComponent, PackedMatrix> };
export type PackedSolverResult = Omit<SolverResult, "modes" | "refractiveIndex"> & {
  modes: PackedMode[];
  refractiveIndex: Record<"x" | "y" | "z", PackedMatrix>;
};

function packMatrix(matrix: number[][]): PackedMatrix {
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  const data = new Float32Array(rows * columns);
  matrix.forEach((row, index) => data.set(row, index * columns));
  return { rows, columns, data };
}

function unpackMatrix(matrix: PackedMatrix): number[][] {
  return Array.from({ length: matrix.rows }, (_, row) => (
    Array.from(matrix.data.subarray(row * matrix.columns, (row + 1) * matrix.columns))
  ));
}

export function packSolverResult(result: SolverResult): { result: PackedSolverResult; transfer: Transferable[] } {
  const modes = result.modes.map((mode) => ({
    ...mode,
    fields: Object.fromEntries(Object.entries(mode.fields).map(([name, matrix]) => [name, packMatrix(matrix)])) as Record<FieldComponent, PackedMatrix>,
  }));
  const refractiveIndex = Object.fromEntries(Object.entries(result.refractiveIndex).map(([name, matrix]) => [name, packMatrix(matrix)])) as PackedSolverResult["refractiveIndex"];
  const packed = { ...result, modes, refractiveIndex };
  const transfer = [
    ...modes.flatMap((mode) => Object.values(mode.fields).map((matrix) => matrix.data.buffer)),
    ...Object.values(refractiveIndex).map((matrix) => matrix.data.buffer),
  ];
  return { result: packed, transfer };
}

export function unpackSolverResult(result: PackedSolverResult): SolverResult {
  return {
    ...result,
    modes: result.modes.map((mode) => ({
      ...mode,
      fields: Object.fromEntries(Object.entries(mode.fields).map(([name, matrix]) => [name, unpackMatrix(matrix)])) as WaveguideMode["fields"],
    })),
    refractiveIndex: Object.fromEntries(Object.entries(result.refractiveIndex).map(([name, matrix]) => [name, unpackMatrix(matrix)])) as SolverResult["refractiveIndex"],
  };
}
