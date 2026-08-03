import type { FieldComponent, PhysicalFieldComponent, SolverResult, WaveguideMode } from "./solver";

interface PackedMatrix {
  rows: number;
  columns: number;
  data: Float32Array;
}

type PackedComplexField = { real: PackedMatrix; imaginary: PackedMatrix };
type PackedMode = Omit<WaveguideMode, "fields" | "complexFields"> & {
  fields: Record<FieldComponent, PackedMatrix>;
  complexFields: Record<PhysicalFieldComponent, PackedComplexField>;
};
type PackedAxisMap = Record<"x" | "y" | "z", PackedMatrix>;
export type PackedSolverResult = Omit<SolverResult, "modes" | "permittivity"> & {
  modes: PackedMode[];
  permittivity: Record<"real" | "imaginary", PackedAxisMap>;
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
    complexFields: Object.fromEntries(Object.entries(mode.complexFields).map(([name, field]) => [name, {
      real: packMatrix(field.real), imaginary: packMatrix(field.imaginary),
    }])) as Record<PhysicalFieldComponent, PackedComplexField>,
  }));
  const permittivity = Object.fromEntries(Object.entries(result.permittivity).map(([part, axes]) => [part,
    Object.fromEntries(Object.entries(axes).map(([axis, matrix]) => [axis, packMatrix(matrix)])),
  ])) as PackedSolverResult["permittivity"];
  const packed = { ...result, modes, permittivity };
  const transfer = [
    ...modes.flatMap((mode) => [
      ...Object.values(mode.fields).map((matrix) => matrix.data.buffer),
      ...Object.values(mode.complexFields).flatMap((field) => [field.real.data.buffer, field.imaginary.data.buffer]),
    ]),
    ...Object.values(permittivity).flatMap((axes) => Object.values(axes).map((matrix) => matrix.data.buffer)),
  ];
  return { result: packed, transfer };
}

export function unpackSolverResult(result: PackedSolverResult): SolverResult {
  return {
    ...result,
    modes: result.modes.map((mode) => ({
      ...mode,
      fields: Object.fromEntries(Object.entries(mode.fields).map(([name, matrix]) => [name, unpackMatrix(matrix)])) as WaveguideMode["fields"],
      complexFields: Object.fromEntries(Object.entries(mode.complexFields).map(([name, field]) => [name, {
        real: unpackMatrix(field.real), imaginary: unpackMatrix(field.imaginary),
      }])) as WaveguideMode["complexFields"],
    })),
    permittivity: Object.fromEntries(Object.entries(result.permittivity).map(([part, axes]) => [part,
      Object.fromEntries(Object.entries(axes).map(([axis, matrix]) => [axis, unpackMatrix(matrix)])),
    ])) as SolverResult["permittivity"],
  };
}
