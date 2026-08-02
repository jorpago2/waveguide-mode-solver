import { EigenvalueDecomposition, Matrix } from "ml-matrix";
import {
  evaluateMaterialPrincipalIndices, evaluateTabulatedMaterial, materialDefinition,
  opticAxisDirection, uniaxialPermittivityTensor, validateTabulatedMaterial,
  type MaterialId, type OpticAxis, type SymmetricTensor, type TabulatedMaterialData,
} from "./materials";

export type FieldComponent = "Ex" | "Ey" | "Ez" | "Hx" | "Hy" | "Hz" | "intensity" | "poynting";
export type GeometryType = "channel" | "rib" | "slot" | "multilayer" | "coupler";
export type BoundaryType = "hard" | "pml";
export type BendDirection = "positive-x" | "negative-x";

export interface VerticalLayer {
  name: string;
  thicknessUm: number;
  material: MaterialId;
  index: number;
  indexY?: number;
  indexZ?: number;
  extinction?: number;
  opticAxis?: OpticAxis;
  opticAxisTiltDeg?: number;
  opticAxisAzimuthDeg?: number;
}

export const PARAMETER_MAXIMUMS = {
  wavelengthUm: 1_000,
  dimensionUm: 1_000,
  refractiveIndex: 50,
  extinction: 10,
  dispersionPerUm: 1_000,
  gridResolution: 96,
  modeCount: 8,
  meshBias: 1.5,
  sweepPoints: 101,
  bendRadiusUm: 1_000_000,
} as const;

export interface WaveguideConfig {
  wavelengthUm: number;
  widthUm: number;
  heightUm: number;
  coreIndex: number;
  claddingIndex: number;
  paddingUm: number;
  gridResolution: number;
  modeCount: number;
  geometry?: GeometryType;
  slabHeightUm?: number;
  slotGapUm?: number;
  substrateIndex?: number;
  substrateIndexY?: number;
  substrateIndexZ?: number;
  coreIndexY?: number;
  coreIndexZ?: number;
  claddingIndexY?: number;
  claddingIndexZ?: number;
  coreExtinction?: number;
  claddingExtinction?: number;
  substrateExtinction?: number;
  coreDispersionPerUm?: number;
  claddingDispersionPerUm?: number;
  substrateDispersionPerUm?: number;
  materialReferenceWavelengthUm?: number;
  meshBias?: number;
  boundary?: BoundaryType;
  pmlThicknessUm?: number;
  pmlStrength?: number;
  coreMaterial?: MaterialId;
  claddingMaterial?: MaterialId;
  substrateMaterial?: MaterialId;
  couplerGapUm?: number;
  coreIndexOffset?: number;
  sidewallAngleDeg?: number;
  materialTemperatureC?: number;
  coreOpticAxis?: OpticAxis;
  claddingOpticAxis?: OpticAxis;
  substrateOpticAxis?: OpticAxis;
  coreOpticAxisTiltDeg?: number;
  coreOpticAxisAzimuthDeg?: number;
  claddingOpticAxisTiltDeg?: number;
  claddingOpticAxisAzimuthDeg?: number;
  substrateOpticAxisTiltDeg?: number;
  substrateOpticAxisAzimuthDeg?: number;
  coreMaterialTable?: TabulatedMaterialData;
  claddingMaterialTable?: TabulatedMaterialData;
  substrateMaterialTable?: TabulatedMaterialData;
  coreElectricFieldVPerUm?: number;
  stackLayers?: VerticalLayer[];
  bendRadiusUm?: number;
  bendDirection?: BendDirection;
}

export interface WaveguideMode {
  id: string;
  label: string;
  order: number;
  horizontalOrder: number;
  verticalOrder: number;
  symmetryX: number;
  symmetryY: number;
  polarization: "quasi-TE" | "quasi-TM";
  effectiveIndex: number;
  effectiveIndexImaginary: number;
  propagationConstantPerUm: number;
  residual: number;
  electricConfinement: number;
  corePowerFraction: number;
  effectiveAreaUm2: number;
  longitudinalElectricFraction: number;
  xPolarizedElectricFraction: number;
  lossDbPerCm: number;
  modalPowerW: number;
  peakPoyntingWPerM2: number;
  guidanceMargin: number;
  nearCutoff: boolean;
  bendRadiusUm?: number;
  azimuthalModeNumber?: number;
  fields: Record<FieldComponent, number[][]>;
}

export interface SolverResult {
  modes: WaveguideMode[];
  xUm: number[];
  yUm: number[];
  xEdgesUm: number[];
  yEdgesUm: number[];
  refractiveIndex: Record<"x" | "y" | "z", number[][]>;
  nx: number;
  ny: number;
  dxUm: number;
  dyUm: number;
  dxMaxUm: number;
  dyMaxUm: number;
  warnings: string[];
  arnoldiDimension: number;
  formulation: "transverse-h" | "first-order";
}

export interface SweepSettings {
  startWavelengthUm: number;
  stopWavelengthUm: number;
  points: number;
  modeIndex: number;
}

export interface SweepPoint {
  wavelengthUm: number;
  effectiveIndex: number;
  groupIndex: number;
  dispersionPsPerNmKm: number;
  beta2Ps2PerKm: number;
  lossDbPerCm: number;
  overlap: number;
  modeLabel: string;
  nearCutoff: boolean;
}

export interface SweepResult {
  points: SweepPoint[];
  warnings: string[];
}

export type GeometrySweepParameter = "widthUm" | "heightUm" | "slotGapUm" | "couplerGapUm" | "bendRadiusUm";

export interface GeometrySweepSettings {
  parameter: GeometrySweepParameter;
  startValueUm: number;
  stopValueUm: number;
  points: number;
  modeIndex: number;
}

export interface GeometrySweepPoint {
  valueUm: number;
  effectiveIndex: number;
  electricConfinement: number;
  effectiveAreaUm2: number;
  lossDbPerCm: number;
  overlap: number;
  modeLabel: string;
  nearCutoff: boolean;
}

export interface GeometrySweepResult {
  parameter: GeometrySweepParameter;
  points: GeometrySweepPoint[];
  warnings: string[];
}

interface Grid {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  dxCell: number[];
  dyCell: number[];
  dxDual: number[];
  dyDual: number[];
  x: number[];
  xNodes: number[];
  y: number[];
  yNodes: number[];
  epsilonCell: Float64Array;
  epsilonCellX: Float64Array;
  epsilonCellY: Float64Array;
  epsilonCellZ: Float64Array;
  epsilonCellXImaginary: Float64Array;
  epsilonCellYImaginary: Float64Array;
  epsilonCellZImaginary: Float64Array;
  epsilonCellXY: Float64Array;
  epsilonCellXYImaginary: Float64Array;
  cellArea: Float64Array;
  coreFraction: Float64Array;
  extinctionCell: Float64Array;
  epsilonX: Float64Array;
  epsilonY: Float64Array;
  inverseEpsilonX: Float64Array;
  inverseEpsilonY: Float64Array;
  inverseEpsilonZ: Float64Array;
  epsilonXImaginary: Float64Array;
  epsilonYImaginary: Float64Array;
  inverseEpsilonXImaginary: Float64Array;
  inverseEpsilonYImaginary: Float64Array;
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

interface OperatorContext {
  grid: Grid;
  k0: number;
  hxSize: number;
  hySize: number;
  apply: (vector: Float64Array) => Float64Array;
  complex: boolean;
  physicalVectorSize: number;
  eigenvaluePower: 1 | 2;
  formulation: "transverse-h" | "first-order";
  linearSolver: "bicgstab" | "gmres";
}

interface RitzPair {
  eigenvalue: number;
  eigenvalueImaginary: number;
  vector: Float64Array;
  vectorImaginary?: Float64Array;
  residual: number;
}

interface ComplexArray {
  real: Float64Array;
  imaginary: Float64Array;
}

export function validateWaveguide(config: WaveguideConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(config.wavelengthUm) || config.wavelengthUm < 0.2 || config.wavelengthUm > PARAMETER_MAXIMUMS.wavelengthUm) {
    errors.push(`Wavelength must be between 0.2 and ${PARAMETER_MAXIMUMS.wavelengthUm} µm.`);
  }
  if (!Number.isFinite(config.widthUm) || config.widthUm < 0.05 || config.widthUm > PARAMETER_MAXIMUMS.dimensionUm) {
    errors.push(`Core width must be between 0.05 and ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isFinite(config.heightUm) || config.heightUm < 0.05 || config.heightUm > PARAMETER_MAXIMUMS.dimensionUm) {
    errors.push(`Core height must be between 0.05 and ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isFinite(config.paddingUm) || config.paddingUm < 0.2 || config.paddingUm > PARAMETER_MAXIMUMS.dimensionUm) {
    errors.push(`Cladding padding must be between 0.2 and ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  if (!Number.isFinite(config.claddingIndex) || config.claddingIndex < 1 || config.claddingIndex > PARAMETER_MAXIMUMS.refractiveIndex) {
    errors.push(`Cladding index must be between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if (!Number.isFinite(config.coreIndex) || config.coreIndex <= config.claddingIndex || config.coreIndex > PARAMETER_MAXIMUMS.refractiveIndex) {
    errors.push(`Core index must be greater than the cladding index and no larger than ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if (!Number.isInteger(config.gridResolution) || config.gridResolution < 24 || config.gridResolution > PARAMETER_MAXIMUMS.gridResolution) {
    errors.push(`Grid resolution must be an integer between 24 and ${PARAMETER_MAXIMUMS.gridResolution}.`);
  }
  if (!Number.isInteger(config.modeCount) || config.modeCount < 1 || config.modeCount > PARAMETER_MAXIMUMS.modeCount) {
    errors.push(`Requested modes must be an integer between 1 and ${PARAMETER_MAXIMUMS.modeCount}.`);
  }
  const finiteOptional = [
    config.coreIndexY, config.coreIndexZ, config.claddingIndexY, config.claddingIndexZ,
    config.coreExtinction, config.claddingExtinction, config.substrateIndex, config.substrateIndexY, config.substrateIndexZ,
    config.substrateExtinction, config.coreDispersionPerUm, config.claddingDispersionPerUm,
    config.substrateDispersionPerUm, config.meshBias, config.coreIndexOffset,
    config.sidewallAngleDeg, config.materialTemperatureC, config.coreElectricFieldVPerUm, config.bendRadiusUm,
    config.coreOpticAxisTiltDeg, config.coreOpticAxisAzimuthDeg, config.claddingOpticAxisTiltDeg,
    config.claddingOpticAxisAzimuthDeg, config.substrateOpticAxisTiltDeg, config.substrateOpticAxisAzimuthDeg,
  ].every((value) => value === undefined || Number.isFinite(value));
  if (!finiteOptional) errors.push("Optional material and mesh values must be finite.");
  if ([config.coreExtinction ?? 0, config.claddingExtinction ?? 0, config.substrateExtinction ?? 0]
    .some((value) => value < 0 || value > PARAMETER_MAXIMUMS.extinction)) {
    errors.push(`Extinction coefficients must be between 0 and ${PARAMETER_MAXIMUMS.extinction}.`);
  }
  if ([config.coreDispersionPerUm ?? 0, config.claddingDispersionPerUm ?? 0, config.substrateDispersionPerUm ?? 0]
    .some((value) => Math.abs(value) > PARAMETER_MAXIMUMS.dispersionPerUm)) {
    errors.push(`Material dispersion slopes must stay within ±${PARAMETER_MAXIMUMS.dispersionPerUm} µm⁻¹.`);
  }
  if ((config.materialReferenceWavelengthUm ?? config.wavelengthUm) < 0.2
    || (config.materialReferenceWavelengthUm ?? config.wavelengthUm) > PARAMETER_MAXIMUMS.wavelengthUm) {
    errors.push(`Material reference wavelength must be between 0.2 and ${PARAMETER_MAXIMUMS.wavelengthUm} µm.`);
  }
  if ((config.meshBias ?? 0) < 0 || (config.meshBias ?? 0) > PARAMETER_MAXIMUMS.meshBias) errors.push(`Mesh bias must be between 0 and ${PARAMETER_MAXIMUMS.meshBias}.`);
  const bendRadiusUm = config.bendRadiusUm ?? 0;
  if (bendRadiusUm < 0 || bendRadiusUm > PARAMETER_MAXIMUMS.bendRadiusUm) errors.push(`Bend radius must be zero for a straight guide or no larger than ${PARAMETER_MAXIMUMS.bendRadiusUm} µm.`);
  if (bendRadiusUm > 0 && bendRadiusUm <= radialHalfDomain(config)) errors.push("Bend radius must exceed the radial half-domain so the cylindrical metric remains positive.");
  if (config.bendDirection !== undefined && !["positive-x", "negative-x"].includes(config.bendDirection)) errors.push("Bend direction must be positive-x or negative-x.");
  if ((config.boundary ?? "hard") === "pml") {
    const thickness = config.pmlThicknessUm ?? config.paddingUm * 0.6;
    if (!(thickness > 0 && thickness < config.paddingUm)) errors.push("PML thickness must be positive and smaller than the cladding padding.");
    if (!Number.isFinite(config.pmlStrength ?? 4) || (config.pmlStrength ?? 4) <= 0 || (config.pmlStrength ?? 4) > 50) errors.push("PML strength must be between 0 and 50.");
  }
  if ((config.geometry ?? "channel") === "rib" && ((config.slabHeightUm ?? 0) <= 0 || (config.slabHeightUm ?? 0) >= config.heightUm)) {
    errors.push("Rib slab height must be positive and smaller than the total core height.");
  }
  if ((config.geometry ?? "channel") === "slot" && ((config.slotGapUm ?? 0) <= 0 || (config.slotGapUm ?? 0) >= config.widthUm)) {
    errors.push("Slot gap must be positive and smaller than the total core width.");
  }
  if ((config.geometry ?? "channel") === "coupler" && (!Number.isFinite(config.couplerGapUm) || (config.couplerGapUm ?? 0) <= 0 || (config.couplerGapUm ?? 0) > PARAMETER_MAXIMUMS.dimensionUm)) {
    errors.push(`Coupler gap must be positive and no larger than ${PARAMETER_MAXIMUMS.dimensionUm} µm.`);
  }
  const sidewallAngle = config.sidewallAngleDeg ?? 90;
  if (sidewallAngle < 20 || sidewallAngle > 90) errors.push("Sidewall angle must be between 20° and 90°, measured from the substrate plane.");
  if ((config.geometry ?? "channel") === "coupler" && (config.couplerGapUm ?? 0) <= 2 * sidewallExpansion(config)) {
    errors.push("The coupler sidewalls overlap at the guide base; increase the gap or sidewall angle.");
  }
  if ((config.geometry ?? "channel") === "multilayer" && ((config.substrateIndex ?? 0) < 1 || (config.substrateIndex ?? 0) > PARAMETER_MAXIMUMS.refractiveIndex)) {
    errors.push(`Substrate index must be between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if ((config.materialTemperatureC ?? 21) < -200 || (config.materialTemperatureC ?? 21) > 500) errors.push("Material temperature must be between -200 and 500 °C.");
  if ((config.coreMaterial ?? "custom") === "lithium-niobate" && ((config.materialTemperatureC ?? 21) < 20 || (config.materialTemperatureC ?? 21) > 240)) errors.push("The LiNbO₃ thermo-optic fit is limited to 20–240 °C.");
  if (Math.abs(config.coreElectricFieldVPerUm ?? 0) > 100) errors.push("The uniform optical-axis electric field must stay within ±100 V/µm.");
  const orientations = [
    [config.coreOpticAxisTiltDeg, config.coreOpticAxisAzimuthDeg],
    [config.claddingOpticAxisTiltDeg, config.claddingOpticAxisAzimuthDeg],
    [config.substrateOpticAxisTiltDeg, config.substrateOpticAxisAzimuthDeg],
    ...(config.stackLayers ?? []).map((layer) => [layer.opticAxisTiltDeg, layer.opticAxisAzimuthDeg]),
  ];
  if (orientations.some(([tilt]) => tilt !== undefined && (tilt < 0 || tilt > 90))) errors.push("Optic-axis tilt must be between 0° and 90° from the vertical y axis.");
  if (orientations.some(([, azimuth]) => azimuth !== undefined && (azimuth < -180 || azimuth > 180))) errors.push("Optic-axis azimuth must be between −180° and 180° from the propagation z axis toward +x.");
  if ((config.coreMaterial ?? "custom") === "lithium-niobate" && Math.abs(config.coreElectricFieldVPerUm ?? 0) > 0
    && (config.wavelengthUm < 1.3 || config.wavelengthUm > 1.6)) errors.push("The built-in LiNbO₃ electro-optic coefficients are limited to 1.3–1.6 µm.");
  const stackLayers = config.stackLayers ?? [];
  if (stackLayers.length > 6) errors.push("The vertical stack is limited to six finite layers.");
  if (stackLayers.some((layer) => !layer.name.trim() || !Number.isFinite(layer.thicknessUm) || layer.thicknessUm <= 0
    || layer.thicknessUm > PARAMETER_MAXIMUMS.dimensionUm || !Number.isFinite(layer.index) || layer.index < 1
    || layer.index > PARAMETER_MAXIMUMS.refractiveIndex || !Number.isFinite(layer.extinction ?? 0)
    || !Number.isFinite(layer.opticAxisTiltDeg ?? 0) || !Number.isFinite(layer.opticAxisAzimuthDeg ?? 0)
    || (layer.extinction ?? 0) < 0 || (layer.extinction ?? 0) > PARAMETER_MAXIMUMS.extinction)) {
    errors.push("Every stack layer needs a name, positive thickness, valid refractive index and non-negative extinction.");
  }
  if (stackLayers.some((layer) => layer.material === "tabulated")) errors.push("Imported material tables are available for the core, cladding and base substrate, not finite stack layers.");
  if (stackLayers.reduce((sum, layer) => sum + layer.thicknessUm, 0) >= config.paddingUm) errors.push("The finite stack must be thinner than the lower cladding padding so the base substrate is sampled.");
  let materialTablesValid = true;
  const tables: Array<[string, MaterialId | undefined, TabulatedMaterialData | undefined]> = [
    ["Core", config.coreMaterial, config.coreMaterialTable],
    ["Cladding", config.claddingMaterial, config.claddingMaterialTable],
    ["Substrate", config.substrateMaterial, config.substrateMaterialTable],
  ];
  for (const [region, materialId, table] of tables) {
    if (materialId !== "tabulated") continue;
    try {
      validateTabulatedMaterial(table);
      evaluateTabulatedMaterial(table as TabulatedMaterialData, config.wavelengthUm);
    } catch (caught) {
      errors.push(`${region}: ${caught instanceof Error ? caught.message : "invalid imported material table."}`);
      materialTablesValid = false;
    }
  }
  let materialModelsValid = true;
  const selectedMaterialIds = new Set([config.coreMaterial, config.claddingMaterial,
    ...((config.geometry ?? "channel") === "multilayer" || stackLayers.length > 0 ? [config.substrateMaterial] : []),
    ...stackLayers.map((layer) => layer.material)]);
  for (const materialId of selectedMaterialIds) {
    if (materialId && materialId !== "custom") {
      const material = materialDefinition(materialId);
      if (config.wavelengthUm < material.minimumWavelengthUm || config.wavelengthUm > material.maximumWavelengthUm) {
        errors.push(`${material.name} is valid from ${material.minimumWavelengthUm} to ${material.maximumWavelengthUm} µm.`);
        materialModelsValid = false;
      }
    }
  }
  if (finiteOptional && materialModelsValid && materialTablesValid) {
    const materials = materialValues(config);
    const materialList = [materials.core, materials.cladding, materials.substrate, ...materials.layers];
    const indices = materialList.flatMap((material) => [material.nx, material.ny, material.nz]);
    if (indices.some((value) => value < 1 || value > PARAMETER_MAXIMUMS.refractiveIndex)) errors.push(`Dispersive material indices must remain between 1 and ${PARAMETER_MAXIMUMS.refractiveIndex} at the solved wavelength.`);
    const coreMaximum = Math.max(materials.core.nx, materials.core.ny, materials.core.nz);
    const exteriorMaximum = Math.max(materials.cladding.nx, materials.cladding.ny, materials.cladding.nz,
      (config.geometry ?? "channel") === "multilayer" || stackLayers.length > 0 ? Math.max(materials.substrate.nx, materials.substrate.ny, materials.substrate.nz) : 0,
      ...materials.layers.flatMap((material) => [material.nx, material.ny, material.nz]));
    if (coreMaximum <= exteriorMaximum) errors.push("The core must retain a larger principal index than the exterior materials.");
    const hasLongitudinalCoupling = materialList.some((material) => [material.epsilonReal.xz, material.epsilonReal.yz, material.epsilonImaginary.xz, material.epsilonImaginary.yz].some((value) => Math.abs(value) > 1e-12));
    const hasTransverseRotation = materialList.some((material) => Math.abs(material.epsilonReal.xy) > 1e-12 || Math.abs(material.epsilonImaginary.xy) > 1e-12);
    const hasMaterialLoss = materialList.some((material) => Object.values(material.epsilonImaginary).some((value) => Math.abs(value) > 1e-12));
    if (hasLongitudinalCoupling) errors.push("The browser solver currently supports rotated anisotropy only in the transverse x–y plane, with z remaining a principal propagation axis.");
    if (hasTransverseRotation && (hasMaterialLoss || (config.boundary ?? "hard") === "pml")) errors.push("Transversely rotated anisotropy currently requires lossless materials and a hard outer boundary.");
    if (bendRadiusUm > 0 && materialList.some((material) => tensorHasOffDiagonal(material.epsilonReal, material.epsilonImaginary))) {
      errors.push("Rotated off-diagonal anisotropy is currently limited to straight guides; a constant local tensor is not rigorous along a curved crystal path.");
    }
  }
  return errors;
}

export function solveWaveguide(config: WaveguideConfig): SolverResult {
  const errors = validateWaveguide(config);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const grid = createGrid(config);
  const operator = (config.bendRadiusUm ?? 0) > 0
    ? createBendOperator(grid, config)
    : gridHasOffDiagonalTensor(grid) ? createTensorOperator(grid, config.wavelengthUm)
      : createVectorOperator(grid, config.wavelengthUm);
  const requestedRitzPairs = Math.max(config.modeCount * (operator.eigenvaluePower === 1 ? 4 : 3), operator.eigenvaluePower === 1 ? 10 : 8);
  const arnoldiDimension = Math.min(
    operator.physicalVectorSize * (operator.complex ? 2 : 1) - 1,
    operator.formulation === "first-order" && (config.bendRadiusUm ?? 0) === 0
      ? Math.max(32, config.modeCount * 10 + 12)
      : Math.max(operator.complex ? (operator.eigenvaluePower === 1 ? 48 : 28) : 16, config.modeCount * (operator.complex ? 12 : 7) + (operator.eigenvaluePower === 1 ? 8 : 0)),
  );
  const pairs = solveLargestEigenpairs(operator, arnoldiDimension, requestedRitzPairs, config);
  const { exteriorIndex, maximumIndex } = guidanceBounds(config);
  const guidedPairs = pairs.filter((pair) => {
    const effectiveIndex = pairEffectiveIndex(pair, operator);
    return effectiveIndex > exteriorIndex + 1e-5 && effectiveIndex < maximumIndex * 1.01;
  });
  const uniquePairs = guidedPairs.filter((pair, index, all) => {
    const effectiveIndex = pairEffectiveIndex(pair, operator);
    return all.findIndex((candidate) => (
      Math.abs(pairEffectiveIndex(candidate, operator) - effectiveIndex) < 1e-7
    )) === index;
  });
  const convergedPairs = uniquePairs.filter((pair) => pair.residual <= 2e-2);
  const modes = convergedPairs
    .slice(0, config.modeCount)
    .map((pair, index) => operator.eigenvaluePower === 1
      ? buildFirstOrderMode(pair, index, config, operator)
      : buildMode(pair, index, config, operator));

  const warnings: string[] = [];
  const cellsAcrossCore = Math.min(
    grid.x.filter((value) => Math.abs(value) <= config.widthUm / 2).length,
    grid.y.filter((value) => Math.abs(value) <= config.heightUm / 2).length,
  );
  if (cellsAcrossCore < 8) warnings.push("Fewer than 8 cells span the smallest core dimension; refine the grid before using quantitative values.");
  if (convergedPairs.length < uniquePairs.length) warnings.push(`${uniquePairs.length - convergedPairs.length} poorly converged mode${uniquePairs.length - convergedPairs.length === 1 ? " was" : "s were"} discarded because the field residual exceeded 2 × 10⁻².`);
  if (modes.length < config.modeCount) warnings.push(`Only ${modes.length} guided mode${modes.length === 1 ? " was" : "s were"} found inside the requested index interval.`);
  if (modes.some((mode) => mode.residual > 2e-3)) warnings.push("One or more eigenpairs need review; reduce the requested mode count or mesh bias before interpreting the field profile.");
  if ((config.bendRadiusUm ?? 0) > 0 && (config.boundary ?? "hard") !== "pml") warnings.push("A bent guide with hard walls cannot yield physical radiation loss; use PML and verify mesh, padding and absorber convergence.");

  return {
    modes,
    xUm: grid.x,
    yUm: grid.y,
    xEdgesUm: grid.xNodes,
    yEdgesUm: grid.yNodes,
    refractiveIndex: {
      x: toMatrix(complexIndex(grid.epsilonCellX, grid.epsilonCellXImaginary), grid.nx, grid.ny),
      y: toMatrix(complexIndex(grid.epsilonCellY, grid.epsilonCellYImaginary), grid.nx, grid.ny),
      z: toMatrix(complexIndex(grid.epsilonCellZ, grid.epsilonCellZImaginary), grid.nx, grid.ny),
    },
    nx: grid.nx,
    ny: grid.ny,
    dxUm: grid.dx,
    dyUm: grid.dy,
    dxMaxUm: Math.max(...grid.dxCell),
    dyMaxUm: Math.max(...grid.dyCell),
    warnings,
    arnoldiDimension,
    formulation: operator.formulation,
  };
}

function pairEffectiveIndex(pair: RitzPair, operator: OperatorContext): number {
  const beta = operator.eigenvaluePower === 1 ? pair.eigenvalue : Math.sqrt(Math.max(0, pair.eigenvalue));
  return beta / operator.k0;
}

export function sweepWaveguide(config: WaveguideConfig, settings: SweepSettings): SweepResult {
  if (!(settings.startWavelengthUm >= 0.2 && settings.stopWavelengthUm <= PARAMETER_MAXIMUMS.wavelengthUm && settings.stopWavelengthUm > settings.startWavelengthUm)) {
    throw new Error(`Sweep limits must be ordered and stay between 0.2 and ${PARAMETER_MAXIMUMS.wavelengthUm} µm.`);
  }
  if (!Number.isInteger(settings.points) || settings.points < 5 || settings.points > PARAMETER_MAXIMUMS.sweepPoints) {
    throw new Error(`Sweep points must be an integer between 5 and ${PARAMETER_MAXIMUMS.sweepPoints}.`);
  }
  const wavelengths = Array.from({ length: settings.points }, (_, index) => (
    settings.startWavelengthUm + index * (settings.stopWavelengthUm - settings.startWavelengthUm) / (settings.points - 1)
  ));
  const anchor = wavelengths.reduce((best, value, index) => (
    Math.abs(value - config.wavelengthUm) < Math.abs(wavelengths[best] - config.wavelengthUm) ? index : best
  ), 0);
  const tracked: Array<{ mode: WaveguideMode; overlap: number } | undefined> = new Array(settings.points);
  const solveAt = (index: number) => solveWaveguide({ ...config, wavelengthUm: wavelengths[index] }).modes;
  const anchorModes = solveAt(anchor);
  if (anchorModes.length === 0) throw new Error("No guided mode exists at the sweep anchor wavelength.");
  tracked[anchor] = { mode: anchorModes[Math.min(settings.modeIndex, anchorModes.length - 1)], overlap: 1 };

  for (const direction of [1, -1]) {
    for (let index = anchor + direction; index >= 0 && index < wavelengths.length; index += direction) {
      const previous = tracked[index - direction]?.mode;
      const candidates = solveAt(index);
      if (!previous || candidates.length === 0) break;
      const matching = candidates.filter((mode) => sameModeFamily(previous, mode));
      const ranked = (matching.length > 0 ? matching : candidates).map((mode) => ({ mode, overlap: modeOverlap(previous, mode) }))
        .sort((first, second) => second.overlap - first.overlap);
      tracked[index] = ranked[0];
    }
  }

  const valid = tracked.map((entry, index) => entry && ({ wavelengthUm: wavelengths[index], ...entry })).filter(Boolean) as Array<{
    wavelengthUm: number; mode: WaveguideMode; overlap: number;
  }>;
  if (valid.length < 5) throw new Error("The selected mode could not be tracked across at least five wavelengths.");
  const lambda = valid.map((entry) => entry.wavelengthUm);
  const neff = valid.map((entry) => entry.mode.effectiveIndex);
  const first = derivative(lambda, neff);
  const second = secondDerivative(lambda, neff);
  const speedOfLight = 299_792_458;
  const points = valid.map((entry, index) => {
    const dispersionPsPerNmKm = -(entry.wavelengthUm * 1e12 / speedOfLight) * second[index];
    const wavelengthM = entry.wavelengthUm * 1e-6;
    return {
      wavelengthUm: entry.wavelengthUm,
      effectiveIndex: entry.mode.effectiveIndex,
      groupIndex: entry.mode.effectiveIndex - entry.wavelengthUm * first[index],
      dispersionPsPerNmKm,
      beta2Ps2PerKm: -(wavelengthM ** 2 / (2 * Math.PI * speedOfLight)) * dispersionPsPerNmKm * 1e21,
      lossDbPerCm: entry.mode.lossDbPerCm,
      overlap: entry.overlap,
      modeLabel: entry.mode.label,
      nearCutoff: entry.mode.nearCutoff,
    };
  });
  const warnings: string[] = [];
  if (valid.length < settings.points) warnings.push(`Mode tracking stopped at ${valid.length} of ${settings.points} wavelengths.`);
  if (points.some((point) => point.overlap < 0.75)) warnings.push("A low field overlap indicates a possible mode crossing; inspect that interval.");
  if (points.some((point) => point.nearCutoff)) warnings.push("The tracked mode approaches cutoff; increase padding and verify mesh convergence near that interval.");
  warnings.push("Group index and dispersion use finite differences; repeat with more wavelength points to check convergence.");
  return { points, warnings };
}

export function sweepGeometry(config: WaveguideConfig, settings: GeometrySweepSettings): GeometrySweepResult {
  const maximumSweepValue = settings.parameter === "bendRadiusUm" ? PARAMETER_MAXIMUMS.bendRadiusUm : PARAMETER_MAXIMUMS.dimensionUm;
  if (!(settings.startValueUm > 0 && settings.stopValueUm > settings.startValueUm && settings.stopValueUm <= maximumSweepValue)) {
    throw new Error(`Geometry sweep limits must be positive, ordered and no larger than ${maximumSweepValue} µm.`);
  }
  if (!Number.isInteger(settings.points) || settings.points < 3 || settings.points > PARAMETER_MAXIMUMS.sweepPoints) {
    throw new Error(`Geometry sweep points must be an integer between 3 and ${PARAMETER_MAXIMUMS.sweepPoints}.`);
  }
  if (settings.parameter === "slotGapUm" && (config.geometry ?? "channel") !== "slot") {
    throw new Error("Slot-gap sweeps require the slot geometry.");
  }
  if (settings.parameter === "couplerGapUm" && (config.geometry ?? "channel") !== "coupler") {
    throw new Error("Coupler-gap sweeps require the coupler geometry.");
  }
  if (settings.parameter === "bendRadiusUm" && (config.bendRadiusUm ?? 0) <= 0) throw new Error("Bend-radius sweeps require a bent propagation path.");
  const currentValue = settings.parameter === "slotGapUm" ? (config.slotGapUm ?? config.widthUm / 5)
    : settings.parameter === "couplerGapUm" ? (config.couplerGapUm ?? config.widthUm / 2)
    : config[settings.parameter] ?? 0;
  const values = Array.from({ length: settings.points }, (_, index) => (
    settings.startValueUm + index * (settings.stopValueUm - settings.startValueUm) / (settings.points - 1)
  ));
  const anchor = values.reduce((best, value, index) => (
    Math.abs(value - currentValue) < Math.abs(values[best] - currentValue) ? index : best
  ), 0);
  const tracked: Array<{ result: SolverResult; mode: WaveguideMode; overlap: number } | undefined> = new Array(settings.points);
  const solveAt = (index: number) => {
    const nextConfig = { ...config, [settings.parameter]: values[index] };
    const errors = validateWaveguide(nextConfig);
    if (errors.length > 0) return undefined;
    return solveWaveguide(nextConfig);
  };
  const anchorResult = solveAt(anchor);
  if (!anchorResult?.modes.length) throw new Error("No guided mode exists at the geometry-sweep anchor.");
  tracked[anchor] = {
    result: anchorResult,
    mode: anchorResult.modes[Math.min(settings.modeIndex, anchorResult.modes.length - 1)],
    overlap: 1,
  };

  for (const direction of [1, -1]) {
    for (let index = anchor + direction; index >= 0 && index < values.length; index += direction) {
      const previous = tracked[index - direction];
      const candidateResult = solveAt(index);
      if (!previous || !candidateResult?.modes.length) break;
      const matching = candidateResult.modes.filter((mode) => sameModeFamily(previous.mode, mode));
      const ranked = (matching.length > 0 ? matching : candidateResult.modes).map((mode) => ({
        result: candidateResult,
        mode,
        overlap: resampledModeOverlap(previous.result, previous.mode, candidateResult, mode),
      })).sort((first, second) => second.overlap - first.overlap);
      tracked[index] = ranked[0];
    }
  }

  const points = tracked.map((entry, index) => entry && ({
    valueUm: values[index],
    effectiveIndex: entry.mode.effectiveIndex,
    electricConfinement: entry.mode.electricConfinement,
    effectiveAreaUm2: entry.mode.effectiveAreaUm2,
    lossDbPerCm: entry.mode.lossDbPerCm,
    overlap: entry.overlap,
    modeLabel: entry.mode.label,
    nearCutoff: entry.mode.nearCutoff,
  })).filter(Boolean) as GeometrySweepPoint[];
  if (points.length < 3) throw new Error("The selected mode could not be tracked across at least three geometry values.");
  const warnings: string[] = [];
  if (points.length < settings.points) warnings.push(`Mode tracking stopped at ${points.length} of ${settings.points} geometry values.`);
  if (points.some((point) => point.overlap < 0.75)) warnings.push("A low field overlap indicates a possible mode crossing; inspect that interval.");
  if (points.some((point) => point.nearCutoff)) warnings.push("The tracked mode approaches cutoff; verify the mesh and domain around that geometry.");
  return { parameter: settings.parameter, points, warnings };
}

function sameModeFamily(first: WaveguideMode, second: WaveguideMode): boolean {
  return first.polarization === second.polarization
    && first.horizontalOrder === second.horizontalOrder
    && first.verticalOrder === second.verticalOrder;
}

interface MaterialValue {
  nx: number;
  ny: number;
  nz: number;
  k: number;
  epsilonReal: SymmetricTensor;
  epsilonImaginary: SymmetricTensor;
}

function materialValues(config: WaveguideConfig) {
  const reference = config.materialReferenceWavelengthUm ?? config.wavelengthUm;
  const offset = config.wavelengthUm - reference;
  const values = (
    materialId: MaterialId | undefined, base: number, ny: number | undefined, nz: number | undefined,
    k: number | undefined, slope: number | undefined, opticAxis: OpticAxis | undefined,
    indexOffset = 0, electricFieldVPerUm = 0, tiltDeg?: number, azimuthDeg?: number, table?: TabulatedMaterialData,
  ): MaterialValue => {
    if (materialId === "tabulated") {
      const sample = evaluateTabulatedMaterial(table as TabulatedMaterialData, config.wavelengthUm);
      return diagonalMaterial(sample.n + indexOffset, sample.n + indexOffset, sample.n + indexOffset, sample.k);
    }
    if (materialId && materialId !== "custom") {
      const principal = evaluateMaterialPrincipalIndices(materialId, config.wavelengthUm, config.materialTemperatureC ?? 21, electricFieldVPerUm);
      const ordinary = principal.ordinary + indexOffset;
      const extraordinary = principal.extraordinary + indexOffset;
      const axis = opticAxisDirection(opticAxis ?? "y", tiltDeg, azimuthDeg);
      const epsilonReal = uniaxialPermittivityTensor(ordinary, extraordinary, axis);
      const extinction = k ?? 0;
      epsilonReal.xx -= extinction ** 2;
      epsilonReal.yy -= extinction ** 2;
      epsilonReal.zz -= extinction ** 2;
      const ordinaryImaginary = 2 * ordinary * extinction;
      const imaginaryContrast = 2 * extinction * (extraordinary - ordinary);
      const [x, y, z] = axis;
      const epsilonImaginary = {
        xx: ordinaryImaginary + imaginaryContrast * x ** 2,
        yy: ordinaryImaginary + imaginaryContrast * y ** 2,
        zz: ordinaryImaginary + imaginaryContrast * z ** 2,
        xy: imaginaryContrast * x * y,
        xz: imaginaryContrast * x * z,
        yz: imaginaryContrast * y * z,
      };
      return {
        nx: complexIndexValue(epsilonReal.xx, epsilonImaginary.xx),
        ny: complexIndexValue(epsilonReal.yy, epsilonImaginary.yy),
        nz: complexIndexValue(epsilonReal.zz, epsilonImaginary.zz),
        k: extinction,
        epsilonReal,
        epsilonImaginary,
      };
    }
    return diagonalMaterial(
      base + (slope ?? 0) * offset + indexOffset,
      (ny ?? base) + (slope ?? 0) * offset + indexOffset,
      (nz ?? base) + (slope ?? 0) * offset + indexOffset,
      k ?? 0,
    );
  };
  return {
    core: values(config.coreMaterial, config.coreIndex, config.coreIndexY, config.coreIndexZ, config.coreExtinction, config.coreDispersionPerUm, config.coreOpticAxis, config.coreIndexOffset ?? 0, config.coreElectricFieldVPerUm, config.coreOpticAxisTiltDeg, config.coreOpticAxisAzimuthDeg, config.coreMaterialTable),
    cladding: values(config.claddingMaterial, config.claddingIndex, config.claddingIndexY, config.claddingIndexZ, config.claddingExtinction, config.claddingDispersionPerUm, config.claddingOpticAxis, 0, 0, config.claddingOpticAxisTiltDeg, config.claddingOpticAxisAzimuthDeg, config.claddingMaterialTable),
    substrate: values(config.substrateMaterial, config.substrateIndex ?? config.claddingIndex, config.substrateIndexY, config.substrateIndexZ, config.substrateExtinction, config.substrateDispersionPerUm, config.substrateOpticAxis, 0, 0, config.substrateOpticAxisTiltDeg, config.substrateOpticAxisAzimuthDeg, config.substrateMaterialTable),
    layers: (config.stackLayers ?? []).map((layer) => values(layer.material, layer.index, layer.indexY, layer.indexZ, layer.extinction, 0, layer.opticAxis, 0, 0, layer.opticAxisTiltDeg, layer.opticAxisAzimuthDeg)),
  };
}

function diagonalMaterial(nx: number, ny: number, nz: number, k: number): MaterialValue {
  const zero = { xy: 0, xz: 0, yz: 0 };
  return {
    nx, ny, nz, k,
    epsilonReal: { xx: nx ** 2 - k ** 2, yy: ny ** 2 - k ** 2, zz: nz ** 2 - k ** 2, ...zero },
    epsilonImaginary: { xx: 2 * nx * k, yy: 2 * ny * k, zz: 2 * nz * k, ...zero },
  };
}

function complexIndexValue(permittivityReal: number, permittivityImaginary: number): number {
  return Math.sqrt((Math.hypot(permittivityReal, permittivityImaginary) + permittivityReal) / 2);
}

function tensorHasOffDiagonal(real: SymmetricTensor, imaginary: SymmetricTensor): boolean {
  return [real.xy, real.xz, real.yz, imaginary.xy, imaginary.xz, imaginary.yz].some((value) => Math.abs(value) > 1e-12);
}

function guidanceBounds(config: WaveguideConfig): { exteriorIndex: number; maximumIndex: number } {
  const values = materialValues(config);
  const maximum = (material: { nx: number; ny: number; nz: number }) => Math.max(material.nx, material.ny, material.nz);
  const stackMaximum = values.layers.reduce((value, layer) => Math.max(value, maximum(layer)), 0);
  const hasSubstrate = (config.geometry ?? "channel") === "multilayer" || (config.stackLayers?.length ?? 0) > 0;
  return {
    exteriorIndex: Math.max(maximum(values.cladding), hasSubstrate ? maximum(values.substrate) : 0, stackMaximum),
    maximumIndex: Math.max(maximum(values.core), maximum(values.cladding), hasSubstrate ? maximum(values.substrate) : 0, stackMaximum),
  };
}

function coreFractionAtCell(x0: number, x1: number, y0: number, y1: number, config: WaveguideConfig): number {
  const geometry = config.geometry ?? "channel";
  const coreBottom = -config.heightUm / 2;
  const coreTop = config.heightUm / 2;
  let core = 0;
  if (geometry === "rib") {
    const slabTop = coreBottom + (config.slabHeightUm ?? config.heightUm / 2);
    core = rectangleFraction(x0, x1, y0, y1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, coreBottom, slabTop)
      + trapezoidFraction(x0, x1, y0, y1, 0, config.widthUm, config.widthUm + 2 * sidewallExpansion(config), slabTop, coreTop);
  } else if (geometry === "slot") {
    const gap = config.slotGapUm ?? config.widthUm / 5;
    core = rectangleFraction(x0, x1, y0, y1, -config.widthUm / 2, -gap / 2, coreBottom, coreTop)
      + rectangleFraction(x0, x1, y0, y1, gap / 2, config.widthUm / 2, coreBottom, coreTop);
  } else if (geometry === "coupler") {
    const gap = config.couplerGapUm ?? config.widthUm / 2;
    const bottomWidth = config.widthUm + 2 * sidewallExpansion(config);
    core = trapezoidFraction(x0, x1, y0, y1, -gap / 2 - config.widthUm / 2, config.widthUm, bottomWidth, coreBottom, coreTop)
      + trapezoidFraction(x0, x1, y0, y1, gap / 2 + config.widthUm / 2, config.widthUm, bottomWidth, coreBottom, coreTop);
  } else {
    core = trapezoidFraction(x0, x1, y0, y1, 0, config.widthUm, config.widthUm + 2 * sidewallExpansion(config), coreBottom, coreTop);
  }
  return clamp(core, 0, 1);
}

function stackFractions(y0: number, y1: number, config: WaveguideConfig): { layers: number[]; substrate: number } {
  const layers = config.stackLayers ?? [];
  const active = layers.length > 0 || (config.geometry ?? "channel") === "multilayer";
  if (!active) return { layers: layers.map(() => 0), substrate: 0 };
  let top = -config.heightUm / 2;
  const fractions = layers.map((layer) => {
    const bottom = top - layer.thicknessUm;
    const fraction = intervalFraction(y0, y1, bottom, top);
    top = bottom;
    return fraction;
  });
  return { layers: fractions, substrate: intervalFraction(y0, y1, Number.NEGATIVE_INFINITY, top) };
}

function intervalFraction(value0: number, value1: number, interval0: number, interval1: number): number {
  return Math.max(0, Math.min(value1, interval1) - Math.max(value0, interval0)) / (value1 - value0);
}

function sidewallExpansion(config: WaveguideConfig): number {
  if ((config.geometry ?? "channel") === "slot") return 0;
  const etchedHeight = (config.geometry ?? "channel") === "rib"
    ? config.heightUm - (config.slabHeightUm ?? config.heightUm / 2)
    : config.heightUm;
  return etchedHeight / Math.tan((config.sidewallAngleDeg ?? 90) * Math.PI / 180);
}

function lateralCoreSpan(config: WaveguideConfig): number {
  const expansion = sidewallExpansion(config);
  return (config.geometry ?? "channel") === "coupler"
    ? 2 * config.widthUm + (config.couplerGapUm ?? config.widthUm / 2) + 2 * expansion
    : config.widthUm + 2 * expansion;
}

function radialHalfDomain(config: WaveguideConfig): number {
  return lateralCoreSpan(config) / 2 + config.paddingUm;
}

function trapezoidFraction(
  x0: number, x1: number, y0: number, y1: number,
  centerX: number, topWidth: number, bottomWidth: number, bottomY: number, topY: number,
): number {
  return polygonFraction(x0, x1, y0, y1, [
    { x: centerX - bottomWidth / 2, y: bottomY },
    { x: centerX + bottomWidth / 2, y: bottomY },
    { x: centerX + topWidth / 2, y: topY },
    { x: centerX - topWidth / 2, y: topY },
  ]);
}

function polygonFraction(x0: number, x1: number, y0: number, y1: number, polygon: Array<{ x: number; y: number }>): number {
  let clipped = clipPolygon(polygon, (point) => point.x >= x0, (first, second) => intersectX(first, second, x0));
  clipped = clipPolygon(clipped, (point) => point.x <= x1, (first, second) => intersectX(first, second, x1));
  clipped = clipPolygon(clipped, (point) => point.y >= y0, (first, second) => intersectY(first, second, y0));
  clipped = clipPolygon(clipped, (point) => point.y <= y1, (first, second) => intersectY(first, second, y1));
  if (clipped.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < clipped.length; index += 1) {
    const next = clipped[(index + 1) % clipped.length];
    twiceArea += clipped[index].x * next.y - next.x * clipped[index].y;
  }
  return Math.abs(twiceArea) / 2 / ((x1 - x0) * (y1 - y0));
}

function clipPolygon(
  polygon: Array<{ x: number; y: number }>,
  inside: (point: { x: number; y: number }) => boolean,
  intersect: (first: { x: number; y: number }, second: { x: number; y: number }) => { x: number; y: number },
): Array<{ x: number; y: number }> {
  const output: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (inside(current)) {
      if (!inside(previous)) output.push(intersect(previous, current));
      output.push(current);
    } else if (inside(previous)) output.push(intersect(previous, current));
  }
  return output;
}

function intersectX(first: { x: number; y: number }, second: { x: number; y: number }, x: number): { x: number; y: number } {
  const fraction = (x - first.x) / (second.x - first.x);
  return { x, y: first.y + fraction * (second.y - first.y) };
}

function intersectY(first: { x: number; y: number }, second: { x: number; y: number }, y: number): { x: number; y: number } {
  const fraction = (y - first.y) / (second.y - first.y);
  return { x: first.x + fraction * (second.x - first.x), y };
}

function rectangleFraction(
  x0: number, x1: number, y0: number, y1: number,
  rectangleX0: number, rectangleX1: number, rectangleY0: number, rectangleY1: number,
): number {
  const overlapX = Math.max(0, Math.min(x1, rectangleX1) - Math.max(x0, rectangleX0));
  const overlapY = Math.max(0, Math.min(y1, rectangleY1) - Math.max(y0, rectangleY0));
  return overlapX * overlapY / ((x1 - x0) * (y1 - y0));
}

function stretchedEdges(length: number, cells: number, bias: number): number[] {
  if (bias < 1e-9) return Array.from({ length: cells + 1 }, (_, index) => -length / 2 + index * length / cells);
  const denominator = Math.sinh(bias);
  return Array.from({ length: cells + 1 }, (_, index) => {
    const coordinate = -1 + 2 * index / cells;
    return (length / 2) * Math.sinh(bias * coordinate) / denominator;
  });
}

function differences(values: number[]): number[] {
  return values.slice(1).map((value, index) => value - values[index]);
}

function dualSpacing(cellSpacing: number[]): number[] {
  return Array.from({ length: cellSpacing.length + 1 }, (_, index) => {
    if (index === 0) return cellSpacing[0];
    if (index === cellSpacing.length) return cellSpacing[cellSpacing.length - 1];
    return (cellSpacing[index - 1] + cellSpacing[index]) / 2;
  });
}

function modeOverlap(first: WaveguideMode, second: WaveguideMode): number {
  let numerator = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (const component of ["Ex", "Ey", "Ez"] as const) {
    for (let row = 0; row < first.fields[component].length; row += 1) {
      for (let column = 0; column < first.fields[component][row].length; column += 1) {
        const a = first.fields[component][row][column];
        const b = second.fields[component][row][column];
        numerator += a * b;
        firstNorm += a * a;
        secondNorm += b * b;
      }
    }
  }
  return Math.abs(numerator) / Math.sqrt(Math.max(firstNorm * secondNorm, 1e-30));
}

export function resampledModeOverlap(
  firstResult: SolverResult,
  first: WaveguideMode,
  secondResult: SolverResult,
  second: WaveguideMode,
): number {
  let numerator = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (const component of ["Ex", "Ey", "Ez"] as const) {
    for (let row = 0; row < firstResult.yUm.length; row += 1) {
      for (let column = 0; column < firstResult.xUm.length; column += 1) {
        const a = first.fields[component][row][column];
        const b = bilinearSample(second.fields[component], secondResult.xUm, secondResult.yUm,
          firstResult.xUm[column], firstResult.yUm[row]);
        if (b === undefined) continue;
        const area = coordinateSpacing(firstResult.xUm, column) * coordinateSpacing(firstResult.yUm, row);
        numerator += a * b * area;
        firstNorm += a * a * area;
        secondNorm += b * b * area;
      }
    }
  }
  return Math.abs(numerator) / Math.sqrt(Math.max(firstNorm * secondNorm, 1e-30));
}

function coordinateSpacing(coordinates: number[], index: number): number {
  if (index === 0) return coordinates[1] - coordinates[0];
  if (index === coordinates.length - 1) return coordinates[index] - coordinates[index - 1];
  return (coordinates[index + 1] - coordinates[index - 1]) / 2;
}

function bilinearSample(field: number[][], x: number[], y: number[], sampleX: number, sampleY: number): number | undefined {
  const column = lowerIndex(x, sampleX);
  const row = lowerIndex(y, sampleY);
  if (column < 0 || row < 0 || column + 1 >= x.length || row + 1 >= y.length) return undefined;
  const tx = (sampleX - x[column]) / (x[column + 1] - x[column]);
  const ty = (sampleY - y[row]) / (y[row + 1] - y[row]);
  const lower = field[row][column] * (1 - tx) + field[row][column + 1] * tx;
  const upper = field[row + 1][column] * (1 - tx) + field[row + 1][column + 1] * tx;
  return lower * (1 - ty) + upper * ty;
}

function lowerIndex(values: number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle - 1;
  }
  return high;
}

function derivative(x: number[], y: number[]): number[] {
  return y.map((_, index) => {
    if (index === 0) return (y[1] - y[0]) / (x[1] - x[0]);
    if (index === y.length - 1) return (y[index] - y[index - 1]) / (x[index] - x[index - 1]);
    return (y[index + 1] - y[index - 1]) / (x[index + 1] - x[index - 1]);
  });
}

function secondDerivative(x: number[], y: number[]): number[] {
  const first = derivative(x, y);
  return derivative(x, first);
}

function createGrid(config: WaveguideConfig): Grid {
  const domainWidth = lateralCoreSpan(config) + 2 * config.paddingUm;
  const domainHeight = config.heightUm + 2 * config.paddingUm;
  const nominalStep = Math.max(domainWidth, domainHeight) / config.gridResolution;
  const nx = Math.max(12, Math.round(domainWidth / nominalStep));
  const ny = Math.max(12, Math.round(domainHeight / nominalStep));
  const xEdges = stretchedEdges(domainWidth, nx, config.meshBias ?? 0);
  const yEdges = stretchedEdges(domainHeight, ny, config.meshBias ?? 0);
  const dxCell = differences(xEdges);
  const dyCell = differences(yEdges);
  const dxDual = dualSpacing(dxCell);
  const dyDual = dualSpacing(dyCell);
  const x = dxCell.map((_, index) => (xEdges[index] + xEdges[index + 1]) / 2);
  const y = dyCell.map((_, index) => (yEdges[index] + yEdges[index + 1]) / 2);
  const dx = Math.min(...dxCell);
  const dy = Math.min(...dyCell);
  const epsilonCellX = new Float64Array(nx * ny);
  const epsilonCellY = new Float64Array(nx * ny);
  const epsilonCellZ = new Float64Array(nx * ny);
  const epsilonCellXImaginary = new Float64Array(nx * ny);
  const epsilonCellYImaginary = new Float64Array(nx * ny);
  const epsilonCellZImaginary = new Float64Array(nx * ny);
  const epsilonCellXY = new Float64Array(nx * ny);
  const epsilonCellXYImaginary = new Float64Array(nx * ny);
  const epsilonCell = new Float64Array(nx * ny);
  const extinctionCell = new Float64Array(nx * ny);
  const cellArea = new Float64Array(nx * ny);
  const coreFraction = new Float64Array(nx * ny);
  const material = materialValues(config);

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cellIndex(row, column, nx);
      const core = coreFractionAtCell(xEdges[column], xEdges[column + 1], yEdges[row], yEdges[row + 1], config);
      const stack = stackFractions(yEdges[row], yEdges[row + 1], config);
      const layerTotal = stack.layers.reduce((sum, fraction) => sum + fraction, 0);
      const claddingFraction = Math.max(0, 1 - core - stack.substrate - layerTotal);
      const components = [
        { fraction: core, value: material.core },
        { fraction: stack.substrate, value: material.substrate },
        { fraction: claddingFraction, value: material.cladding },
        ...stack.layers.map((fraction, layerIndex) => ({ fraction, value: material.layers[layerIndex] })),
      ];
      coreFraction[index] = core;
      epsilonCellX[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.xx, 0);
      epsilonCellY[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.yy, 0);
      epsilonCellZ[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.zz, 0);
      epsilonCellXY[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.xy, 0);
      epsilonCellXImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.xx, 0);
      epsilonCellYImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.yy, 0);
      epsilonCellZImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.zz, 0);
      epsilonCellXYImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.xy, 0);
      epsilonCell[index] = (epsilonCellX[index] + epsilonCellY[index] + epsilonCellZ[index]) / 3;
      extinctionCell[index] = components.reduce((sum, component) => sum + component.fraction * component.value.k, 0);
      cellArea[index] = dxCell[column] * dyCell[row];
    }
  }

  const epsilonX = new Float64Array((ny + 1) * nx);
  const epsilonXImaginary = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = epsilonCellX[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)];
      const north = epsilonCellX[cellIndex(clamp(row, 0, ny - 1), column, nx)];
      epsilonX[row * nx + column] = (south + north) / 2;
      epsilonXImaginary[row * nx + column] = (epsilonCellXImaginary[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)] + epsilonCellXImaginary[cellIndex(clamp(row, 0, ny - 1), column, nx)]) / 2;
    }
  }

  const epsilonY = new Float64Array(ny * (nx + 1));
  const epsilonYImaginary = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = epsilonCellY[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)];
      const east = epsilonCellY[cellIndex(row, clamp(column, 0, nx - 1), nx)];
      epsilonY[row * (nx + 1) + column] = (west + east) / 2;
      epsilonYImaginary[row * (nx + 1) + column] = (epsilonCellYImaginary[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)] + epsilonCellYImaginary[cellIndex(row, clamp(column, 0, nx - 1), nx)]) / 2;
    }
  }

  const inverseEpsilonZ = new Float64Array((ny + 1) * (nx + 1));
  const inverseEpsilonZImaginary = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = clamp(row - 1, 0, ny - 1);
      const north = clamp(row, 0, ny - 1);
      const west = clamp(column - 1, 0, nx - 1);
      const east = clamp(column, 0, nx - 1);
      const average = (
        epsilonCellZ[cellIndex(south, west, nx)]
        + epsilonCellZ[cellIndex(south, east, nx)]
        + epsilonCellZ[cellIndex(north, west, nx)]
        + epsilonCellZ[cellIndex(north, east, nx)]
      ) / 4;
      const averageImaginary = (
        epsilonCellZImaginary[cellIndex(south, west, nx)]
        + epsilonCellZImaginary[cellIndex(south, east, nx)]
        + epsilonCellZImaginary[cellIndex(north, west, nx)]
        + epsilonCellZImaginary[cellIndex(north, east, nx)]
      ) / 4;
      const denominator = average ** 2 + averageImaginary ** 2;
      inverseEpsilonZ[row * (nx + 1) + column] = average / denominator;
      inverseEpsilonZImaginary[row * (nx + 1) + column] = -averageImaginary / denominator;
    }
  }

  const inverseEpsilonX = complexReciprocal(epsilonX, epsilonXImaginary);
  const inverseEpsilonY = complexReciprocal(epsilonY, epsilonYImaginary);
  const pmlThickness = (config.boundary ?? "hard") === "pml" ? (config.pmlThicknessUm ?? config.paddingUm * 0.6) : 0;
  const pmlStrength = config.pmlStrength ?? 4;
  const xCellStretch = stretchProfile(x, domainWidth / 2, pmlThickness, pmlStrength);
  const yCellStretch = stretchProfile(y, domainHeight / 2, pmlThickness, pmlStrength);
  const xNodeStretch = stretchProfile(xEdges, domainWidth / 2, pmlThickness, pmlStrength);
  const yNodeStretch = stretchProfile(yEdges, domainHeight / 2, pmlThickness, pmlStrength);

  return {
    nx,
    ny,
    dx,
    dy,
    dxCell,
    dyCell,
    dxDual,
    dyDual,
    x,
    xNodes: xEdges,
    y,
    yNodes: yEdges,
    epsilonCell,
    epsilonCellX,
    epsilonCellY,
    epsilonCellZ,
    epsilonCellXImaginary,
    epsilonCellYImaginary,
    epsilonCellZImaginary,
    epsilonCellXY,
    epsilonCellXYImaginary,
    cellArea,
    coreFraction,
    extinctionCell,
    epsilonX,
    epsilonY,
    inverseEpsilonX: inverseEpsilonX.real,
    inverseEpsilonY: inverseEpsilonY.real,
    inverseEpsilonZ,
    epsilonXImaginary,
    epsilonYImaginary,
    inverseEpsilonXImaginary: inverseEpsilonX.imaginary,
    inverseEpsilonYImaginary: inverseEpsilonY.imaginary,
    inverseEpsilonZImaginary,
    inverseStretchXCellReal: xCellStretch.real,
    inverseStretchXCellImaginary: xCellStretch.imaginary,
    inverseStretchXNodeReal: xNodeStretch.real,
    inverseStretchXNodeImaginary: xNodeStretch.imaginary,
    inverseStretchYCellReal: yCellStretch.real,
    inverseStretchYCellImaginary: yCellStretch.imaginary,
    inverseStretchYNodeReal: yNodeStretch.real,
    inverseStretchYNodeImaginary: yNodeStretch.imaginary,
  };
}

function complexReciprocal(real: Float64Array, imaginary: Float64Array): { real: Float64Array; imaginary: Float64Array } {
  const outputReal = new Float64Array(real.length);
  const outputImaginary = new Float64Array(real.length);
  for (let index = 0; index < real.length; index += 1) {
    const denominator = real[index] ** 2 + imaginary[index] ** 2;
    outputReal[index] = real[index] / denominator;
    outputImaginary[index] = -imaginary[index] / denominator;
  }
  return { real: outputReal, imaginary: outputImaginary };
}

function complexIndex(permittivityReal: Float64Array, permittivityImaginary: Float64Array): Float64Array {
  return Float64Array.from(permittivityReal, (real, index) => Math.sqrt((Math.hypot(real, permittivityImaginary[index]) + real) / 2));
}

function stretchProfile(coordinates: number[], halfDomain: number, thickness: number, strength: number): { real: Float64Array; imaginary: Float64Array } {
  const real = new Float64Array(coordinates.length).fill(1);
  const imaginary = new Float64Array(coordinates.length);
  if (thickness <= 0) return { real, imaginary };
  for (let index = 0; index < coordinates.length; index += 1) {
    const depth = Math.max(0, Math.abs(coordinates[index]) - (halfDomain - thickness)) / thickness;
    const damping = strength * depth ** 3;
    const denominator = 1 + damping ** 2;
    real[index] = 1 / denominator;
    imaginary[index] = -damping / denominator;
  }
  return { real, imaginary };
}

function createVectorOperator(grid: Grid, wavelengthUm: number): OperatorContext {
  const { nx, ny, dxCell, dyCell, dxDual, dyDual, epsilonX, epsilonY, inverseEpsilonZ } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const k0 = (2 * Math.PI) / wavelengthUm;
  const inverseK0Squared = 1 / k0 ** 2;

  const applyReal = (vector: Float64Array): Float64Array => {
    const hx = vector.subarray(0, hxSize);
    const hy = vector.subarray(hxSize);
    const transverseDivergence = add(bx(hx, nx, ny, dxCell), by(hy, nx, ny, dyCell));
    const longitudinalCurl = subtract(dyOperator(hx, nx, ny, dyDual), dxOperator(hy, nx, ny, dxDual));
    multiplyInPlace(longitudinalCurl, inverseEpsilonZ);
    const correction = subtract(
      bx(ay(longitudinalCurl, nx, ny, dyCell), nx, ny, dxCell),
      by(ax(longitudinalCurl, nx, ny, dxCell), nx, ny, dyCell),
    );
    addScaledInPlace(transverseDivergence, correction, inverseK0Squared);

    const outputHx = cx(transverseDivergence, nx, ny, dxDual);
    const outputHy = cy(transverseDivergence, nx, ny, dyDual);
    addScaledInPlace(outputHx, ay(longitudinalCurl, nx, ny, dyCell), 1, epsilonY);
    addScaledInPlace(outputHy, ax(longitudinalCurl, nx, ny, dxCell), -1, epsilonX);
    addScaledInPlace(outputHx, hx, k0 ** 2, epsilonY);
    addScaledInPlace(outputHy, hy, k0 ** 2, epsilonX);

    const output = new Float64Array(hxSize + hySize);
    output.set(outputHx, 0);
    output.set(outputHy, hxSize);
    return output;
  };
  const complex = grid.epsilonXImaginary.some((value) => value !== 0)
    || grid.epsilonYImaginary.some((value) => value !== 0)
    || grid.inverseStretchXCellImaginary.some((value) => value !== 0)
    || grid.inverseStretchYCellImaginary.some((value) => value !== 0);
  const apply = complex ? (vector: Float64Array): Float64Array => {
    const vectorSize = hxSize + hySize;
    const hx = complexSlice(vector, 0, hxSize, vectorSize);
    const hy = complexSlice(vector, hxSize, vectorSize, vectorSize);
    const transverseDivergence = complexAdd(
      complexBx(hx, grid), complexBy(hy, grid),
    );
    const longitudinalCurl = complexSubtract(
      complexDyOperator(hx, grid), complexDxOperator(hy, grid),
    );
    complexMultiplyInPlace(longitudinalCurl, grid.inverseEpsilonZ, grid.inverseEpsilonZImaginary);
    const correction = complexSubtract(
      complexBx(complexAy(longitudinalCurl, grid), grid),
      complexBy(complexAx(longitudinalCurl, grid), grid),
    );
    complexAddScaledInPlace(transverseDivergence, correction, inverseK0Squared);
    const outputHx = complexCx(transverseDivergence, grid);
    const outputHy = complexCy(transverseDivergence, grid);
    complexAddProductInPlace(outputHx, complexAy(longitudinalCurl, grid), epsilonY, grid.epsilonYImaginary, 1);
    complexAddProductInPlace(outputHy, complexAx(longitudinalCurl, grid), epsilonX, grid.epsilonXImaginary, -1);
    complexAddProductInPlace(outputHx, hx, epsilonY, grid.epsilonYImaginary, k0 ** 2);
    complexAddProductInPlace(outputHy, hy, epsilonX, grid.epsilonXImaginary, k0 ** 2);
    return complexJoin(outputHx, outputHy);
  } : applyReal;

  return { grid, k0, hxSize, hySize, apply, complex, physicalVectorSize: hxSize + hySize, eigenvaluePower: 2, formulation: "transverse-h", linearSolver: "bicgstab" };
}

function gridHasOffDiagonalTensor(grid: Grid): boolean {
  return [grid.epsilonCellXY, grid.epsilonCellXYImaginary]
    .some((component) => component.some((value) => Math.abs(value) > 1e-12));
}

function createTensorOperator(grid: Grid, wavelengthUm: number): OperatorContext {
  const { nx, ny } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const physicalVectorSize = 2 * (hxSize + hySize);
  const k0 = 2 * Math.PI / wavelengthUm;
  const apply = (vector: Float64Array): Float64Array => {
    let offset = 0;
    const ex = vector.subarray(offset, offset += hySize);
    const ey = vector.subarray(offset, offset += hxSize);
    const hx = vector.subarray(offset, offset += hxSize);
    const hy = vector.subarray(offset, offset + hySize);
    const longitudinalPotential = subtract(dyOperator(hx, nx, ny, grid.dyDual), dxOperator(hy, nx, ny, grid.dxDual));
    multiplyInPlace(longitudinalPotential, grid.inverseEpsilonZ);
    const outputEx = scale(ax(longitudinalPotential, nx, ny, grid.dxCell), 1 / k0);
    addScaledInPlace(outputEx, hy, -k0);
    const outputEy = scale(ay(longitudinalPotential, nx, ny, grid.dyCell), 1 / k0);
    addScaledInPlace(outputEy, hx, k0);

    const longitudinalE = subtract(by(ex, nx, ny, grid.dyCell), bx(ey, nx, ny, grid.dxCell));
    const outputHx = scale(cx(longitudinalE, nx, ny, grid.dxDual), -1 / k0);
    const outputHy = scale(cy(longitudinalE, nx, ny, grid.dyDual), -1 / k0);
    const exCell = averageVertical(ex, nx, ny);
    const eyCell = averageHorizontal(ey, nx, ny);
    const displacementX = multiplyCopy(ex, grid.epsilonX);
    const displacementY = multiplyCopy(ey, grid.epsilonY);
    addScaledInPlace(displacementX, averageCellsToVerticalEdges(multiplyCopy(eyCell, grid.epsilonCellXY), nx, ny), 1);
    addScaledInPlace(displacementY, averageCellsToHorizontalEdges(multiplyCopy(exCell, grid.epsilonCellXY), nx, ny), 1);
    addScaledInPlace(outputHx, displacementY, k0);
    addScaledInPlace(outputHy, displacementX, -k0);
    const output = new Float64Array(physicalVectorSize);
    offset = 0;
    output.set(outputEx, offset); offset += hySize;
    output.set(outputEy, offset); offset += hxSize;
    output.set(outputHx, offset); offset += hxSize;
    output.set(outputHy, offset);
    return output;
  };
  return { grid, k0, hxSize, hySize, apply, complex: false, physicalVectorSize, eigenvaluePower: 1, formulation: "first-order", linearSolver: "bicgstab" };
}

function createBendOperator(grid: Grid, config: WaveguideConfig): OperatorContext {
  const { nx, ny, dxCell, dyCell, dxDual, dyDual, epsilonX, epsilonY, inverseEpsilonZ } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const physicalVectorSize = 2 * (hxSize + hySize);
  const k0 = 2 * Math.PI / config.wavelengthUm;
  const signedRadius = (config.bendDirection ?? "positive-x") === "positive-x"
    ? config.bendRadiusUm as number
    : -(config.bendRadiusUm as number);
  const tCell = bendMetric(grid.x, signedRadius, config);
  const tNode = bendMetric(grid.xNodes, signedRadius, config);

  const applyReal = (vector: Float64Array): Float64Array => {
    let offset = 0;
    const ex = vector.subarray(offset, offset += hySize);
    const ey = vector.subarray(offset, offset += hxSize);
    const hx = vector.subarray(offset, offset += hxSize);
    const hy = vector.subarray(offset, offset + hySize);

    const longitudinalH = subtract(dyOperator(hx, nx, ny, dyDual), dxOperator(hy, nx, ny, dxDual));
    multiplyInPlace(longitudinalH, inverseEpsilonZ);
    const tLongitudinalH = longitudinalH.slice();
    multiplyXInPlace(tLongitudinalH, tNode.real, nx + 1);
    const outputEx = scale(ax(tLongitudinalH, nx, ny, dxCell), 1 / k0);
    addXWeightedProductInPlace(outputEx, hy, undefined, tCell.real, -k0, nx);
    const outputEy = ay(longitudinalH, nx, ny, dyCell);
    multiplyXInPlace(outputEy, tNode.real, nx + 1);
    multiplyScalarInPlace(outputEy, 1 / k0);
    addXWeightedProductInPlace(outputEy, hx, undefined, tNode.real, k0, nx + 1);

    const longitudinalE = subtract(by(ex, nx, ny, dyCell), bx(ey, nx, ny, dxCell));
    const tLongitudinalE = longitudinalE.slice();
    multiplyXInPlace(tLongitudinalE, tCell.real, nx);
    const outputHx = scale(cx(tLongitudinalE, nx, ny, dxDual), -1 / k0);
    addXWeightedProductInPlace(outputHx, ey, epsilonY, tNode.real, k0, nx + 1);
    const outputHy = cy(longitudinalE, nx, ny, dyDual);
    multiplyXInPlace(outputHy, tCell.real, nx);
    multiplyScalarInPlace(outputHy, -1 / k0);
    addXWeightedProductInPlace(outputHy, ex, epsilonX, tCell.real, -k0, nx);

    const output = new Float64Array(physicalVectorSize);
    offset = 0;
    output.set(outputEx, offset); offset += hySize;
    output.set(outputEy, offset); offset += hxSize;
    output.set(outputHx, offset); offset += hxSize;
    output.set(outputHy, offset);
    return output;
  };

  const complex = grid.epsilonXImaginary.some((value) => value !== 0)
    || grid.epsilonYImaginary.some((value) => value !== 0)
    || grid.inverseStretchXCellImaginary.some((value) => value !== 0)
    || grid.inverseStretchYCellImaginary.some((value) => value !== 0);
  const apply = complex ? (vector: Float64Array): Float64Array => {
    let offset = 0;
    const ex = complexSlice(vector, offset, hySize, physicalVectorSize); offset += hySize;
    const ey = complexSlice(vector, offset, hxSize, physicalVectorSize); offset += hxSize;
    const hx = complexSlice(vector, offset, hxSize, physicalVectorSize); offset += hxSize;
    const hy = complexSlice(vector, offset, hySize, physicalVectorSize);

    const longitudinalH = complexSubtract(complexDyOperator(hx, grid), complexDxOperator(hy, grid));
    complexMultiplyInPlace(longitudinalH, grid.inverseEpsilonZ, grid.inverseEpsilonZImaginary);
    const tLongitudinalH = complexCopy(longitudinalH);
    complexMultiplyXInPlace(tLongitudinalH, tNode, nx + 1);
    const outputEx = complexAx(tLongitudinalH, grid);
    complexMultiplyScalarInPlace(outputEx, 1 / k0);
    complexAddXWeightedProductInPlace(outputEx, hy, undefined, undefined, tCell, -k0, nx);
    const outputEy = complexAy(longitudinalH, grid);
    complexMultiplyXInPlace(outputEy, tNode, nx + 1);
    complexMultiplyScalarInPlace(outputEy, 1 / k0);
    complexAddXWeightedProductInPlace(outputEy, hx, undefined, undefined, tNode, k0, nx + 1);

    const longitudinalE = complexSubtract(complexBy(ex, grid), complexBx(ey, grid));
    const tLongitudinalE = complexCopy(longitudinalE);
    complexMultiplyXInPlace(tLongitudinalE, tCell, nx);
    const outputHx = complexCx(tLongitudinalE, grid);
    complexMultiplyScalarInPlace(outputHx, -1 / k0);
    complexAddXWeightedProductInPlace(outputHx, ey, epsilonY, grid.epsilonYImaginary, tNode, k0, nx + 1);
    const outputHy = complexCy(longitudinalE, grid);
    complexMultiplyXInPlace(outputHy, tCell, nx);
    complexMultiplyScalarInPlace(outputHy, -1 / k0);
    complexAddXWeightedProductInPlace(outputHy, ex, epsilonX, grid.epsilonXImaginary, tCell, -k0, nx);
    return complexJoinMany([outputEx, outputEy, outputHx, outputHy]);
  } : applyReal;

  return { grid, k0, hxSize, hySize, apply, complex, physicalVectorSize, eigenvaluePower: 1, formulation: "first-order", linearSolver: complex ? "gmres" : "bicgstab" };
}

function bendMetric(coordinates: number[], signedRadius: number, config: WaveguideConfig): ComplexArray {
  const real = new Float64Array(coordinates.length);
  const imaginary = new Float64Array(coordinates.length);
  const pmlThickness = (config.boundary ?? "hard") === "pml" ? (config.pmlThicknessUm ?? config.paddingUm * 0.6) : 0;
  const pmlStrength = config.pmlStrength ?? 4;
  const halfDomain = radialHalfDomain(config);
  for (let index = 0; index < coordinates.length; index += 1) {
    const coordinate = coordinates[index];
    const pmlDepth = Math.max(0, Math.abs(coordinate) - (halfDomain - pmlThickness));
    const stretchedImaginary = pmlThickness > 0
      ? Math.sign(coordinate) * pmlStrength * pmlDepth ** 4 / (4 * pmlThickness ** 3)
      : 0;
    real[index] = 1 + coordinate / signedRadius;
    imaginary[index] = stretchedImaginary / signedRadius;
  }
  return { real, imaginary };
}

function solveLargestEigenpairs(
  operator: OperatorContext,
  arnoldiDimension: number,
  requestedPairs: number,
  config: WaveguideConfig,
): RitzPair[] {
  const physicalVectorSize = operator.physicalVectorSize;
  const vectorSize = physicalVectorSize * (operator.complex ? 2 : 1);
  const { exteriorIndex, maximumIndex } = guidanceBounds(config);
  const targetIndex = 0.55 * maximumIndex + 0.45 * exteriorIndex;
  const shift = (operator.k0 * targetIndex) ** operator.eigenvaluePower;
  const basis: Float64Array[] = [];
  const hessenberg = Array.from({ length: arnoldiDimension + 1 }, () => new Float64Array(arnoldiDimension));
  let vector = deterministicUnitVector(vectorSize);

  for (let column = 0; column < arnoldiDimension; column += 1) {
    basis.push(vector);
    const product = solveShiftedSystem(operator, shift, vector);

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
    const inverseReal = decomposition.realEigenvalues[column];
    const inverseImaginary = decomposition.imaginaryEigenvalues[column];
    if (!operator.complex && Math.abs(inverseImaginary) > 1e-7) continue;
    if (operator.complex && inverseImaginary < -1e-10) continue;
    const inverseMagnitudeSquared = inverseReal ** 2 + inverseImaginary ** 2;
    if (inverseMagnitudeSquared < 1e-24) continue;
    const eigenvalue = shift + inverseReal / inverseMagnitudeSquared;
    const eigenvalueImaginary = -inverseImaginary / inverseMagnitudeSquared;
    if (!(eigenvalue > 0)) continue;
    const ritzBlockReal = new Float64Array(vectorSize);
    const ritzBlockImaginary = new Float64Array(vectorSize);
    for (let basisIndex = 0; basisIndex < dimension; basisIndex += 1) {
      addScaledInPlace(ritzBlockReal, basis[basisIndex], eigenvectors.get(basisIndex, column));
      if (Math.abs(inverseImaginary) > 1e-10 && column + 1 < dimension) {
        addScaledInPlace(ritzBlockImaginary, basis[basisIndex], eigenvectors.get(basisIndex, column + 1));
      }
    }
    const ritzVector = operator.complex ? new Float64Array(physicalVectorSize) : ritzBlockReal;
    const ritzVectorImaginary = operator.complex ? new Float64Array(physicalVectorSize) : undefined;
    if (operator.complex && ritzVectorImaginary) {
      for (let index = 0; index < physicalVectorSize; index += 1) {
        ritzVector[index] = 0.5 * (ritzBlockReal[index] - ritzBlockImaginary[physicalVectorSize + index]);
        ritzVectorImaginary[index] = 0.5 * (ritzBlockImaginary[index] + ritzBlockReal[physicalVectorSize + index]);
      }
    }
    const vectorNorm = Math.sqrt(norm(ritzVector) ** 2 + (ritzVectorImaginary ? norm(ritzVectorImaginary) ** 2 : 0));
    if (vectorNorm < 1e-12) continue;
    multiplyScalarInPlace(ritzVector, 1 / vectorNorm);
    if (ritzVectorImaginary) multiplyScalarInPlace(ritzVectorImaginary, 1 / vectorNorm);
    const residualInput = operator.complex
      ? complexBlock(ritzVector, ritzVectorImaginary as Float64Array)
      : ritzVector;
    const residualVector = operator.apply(residualInput);
    addComplexEigenvalueInPlace(residualVector, residualInput, eigenvalue, eigenvalueImaginary, operator.complex);
    candidates.push({
      eigenvalue,
      eigenvalueImaginary,
      vector: ritzVector,
      vectorImaginary: ritzVectorImaginary,
      residual: norm(residualVector) / Math.max(Math.abs(eigenvalue), 1),
    });
  }

  return candidates
    .sort((first, second) => second.eigenvalue - first.eigenvalue)
    .slice(0, requestedPairs);
}

function complexBlock(real: Float64Array, imaginary: Float64Array): Float64Array {
  const output = new Float64Array(2 * real.length);
  output.set(real);
  output.set(imaginary, real.length);
  return output;
}

function addComplexEigenvalueInPlace(target: Float64Array, vector: Float64Array, real: number, imaginary: number, complex: boolean): void {
  if (!complex) { addScaledInPlace(target, vector, -real); return; }
  const size = vector.length / 2;
  for (let index = 0; index < size; index += 1) {
    target[index] -= real * vector[index] - imaginary * vector[size + index];
    target[size + index] -= imaginary * vector[index] + real * vector[size + index];
  }
}

function solveShiftedSystem(operator: OperatorContext, shift: number, rightHandSide: Float64Array): Float64Array {
  if (operator.linearSolver === "gmres") return solveShiftedGmres(operator, shift, rightHandSide);
  const size = rightHandSide.length;
  const solution = new Float64Array(size);
  let residual = rightHandSide.slice();
  const shadow = residual.slice();
  let direction: Float64Array = new Float64Array(size);
  let operatorDirection: Float64Array = new Float64Array(size);
  let rhoPrevious = 1;
  let alpha = 1;
  let omega = 1;
  const tolerance = 1e-5 * Math.max(norm(rightHandSide), 1);

  const applyShifted = (vector: Float64Array) => {
    const output = operator.apply(vector);
    addScaledInPlace(output, vector, -shift);
    return output;
  };

  for (let iteration = 0; iteration < 180; iteration += 1) {
    const rho = dot(shadow, residual);
    if (Math.abs(rho) < 1e-30) break;
    const beta = (rho / rhoPrevious) * (alpha / omega);
    for (let index = 0; index < size; index += 1) {
      direction[index] = residual[index] + beta * (direction[index] - omega * operatorDirection[index]);
    }
    operatorDirection = applyShifted(direction);
    const denominator = dot(shadow, operatorDirection);
    if (Math.abs(denominator) < 1e-30) break;
    alpha = rho / denominator;
    const intermediate = residual.slice();
    addScaledInPlace(intermediate, operatorDirection, -alpha);
    if (norm(intermediate) <= tolerance) {
      addScaledInPlace(solution, direction, alpha);
      return solution;
    }
    const operatorIntermediate = applyShifted(intermediate);
    const omegaDenominator = dot(operatorIntermediate, operatorIntermediate);
    if (omegaDenominator < 1e-30) break;
    omega = dot(operatorIntermediate, intermediate) / omegaDenominator;
    addScaledInPlace(solution, direction, alpha);
    addScaledInPlace(solution, intermediate, omega);
    residual = intermediate;
    addScaledInPlace(residual, operatorIntermediate, -omega);
    if (norm(residual) <= tolerance) return solution;
    if (Math.abs(omega) < 1e-30) break;
    rhoPrevious = rho;
  }
  return solution;
}

function solveShiftedGmres(operator: OperatorContext, shift: number, rightHandSide: Float64Array): Float64Array {
  const solution = new Float64Array(rightHandSide.length);
  const tolerance = 1e-7 * Math.max(norm(rightHandSide), 1);
  const restart = 30;
  const applyShifted = (vector: Float64Array) => {
    const output = operator.apply(vector);
    addScaledInPlace(output, vector, -shift);
    return output;
  };

  for (let cycle = 0; cycle < 6; cycle += 1) {
    const residual = rightHandSide.slice();
    addScaledInPlace(residual, applyShifted(solution), -1);
    const residualNorm = norm(residual);
    if (residualNorm <= tolerance) return solution;
    const basis = [scale(residual, 1 / residualNorm)];
    const hessenberg = Array.from({ length: restart + 1 }, () => new Float64Array(restart));
    const cosine = new Float64Array(restart);
    const sine = new Float64Array(restart);
    const projectedResidual = new Float64Array(restart + 1);
    projectedResidual[0] = residualNorm;
    let dimension = restart;

    for (let column = 0; column < restart; column += 1) {
      const product = applyShifted(basis[column]);
      for (let row = 0; row <= column; row += 1) {
        hessenberg[row][column] = dot(basis[row], product);
        addScaledInPlace(product, basis[row], -hessenberg[row][column]);
      }
      for (let row = 0; row <= column; row += 1) {
        const correction = dot(basis[row], product);
        hessenberg[row][column] += correction;
        addScaledInPlace(product, basis[row], -correction);
      }
      hessenberg[column + 1][column] = norm(product);
      if (hessenberg[column + 1][column] > 1e-14) basis.push(scale(product, 1 / hessenberg[column + 1][column]));

      for (let row = 0; row < column; row += 1) {
        const upper = cosine[row] * hessenberg[row][column] + sine[row] * hessenberg[row + 1][column];
        hessenberg[row + 1][column] = -sine[row] * hessenberg[row][column] + cosine[row] * hessenberg[row + 1][column];
        hessenberg[row][column] = upper;
      }
      const diagonalNorm = Math.hypot(hessenberg[column][column], hessenberg[column + 1][column]);
      cosine[column] = diagonalNorm > 0 ? hessenberg[column][column] / diagonalNorm : 1;
      sine[column] = diagonalNorm > 0 ? hessenberg[column + 1][column] / diagonalNorm : 0;
      hessenberg[column][column] = diagonalNorm;
      hessenberg[column + 1][column] = 0;
      projectedResidual[column + 1] = -sine[column] * projectedResidual[column];
      projectedResidual[column] *= cosine[column];
      if (Math.abs(projectedResidual[column + 1]) <= tolerance || basis.length <= column + 1) {
        dimension = column + 1;
        break;
      }
    }

    const coefficients = new Float64Array(dimension);
    for (let row = dimension - 1; row >= 0; row -= 1) {
      let value = projectedResidual[row];
      for (let column = row + 1; column < dimension; column += 1) value -= hessenberg[row][column] * coefficients[column];
      coefficients[row] = value / hessenberg[row][row];
    }
    for (let index = 0; index < dimension; index += 1) addScaledInPlace(solution, basis[index], coefficients[index]);
  }
  return solution;
}

function buildFirstOrderMode(pair: RitzPair, order: number, config: WaveguideConfig, operator: OperatorContext): WaveguideMode {
  const { grid, hxSize, hySize, k0 } = operator;
  const { nx, ny } = grid;
  const betaComplex = { real: pair.eigenvalue, imaginary: pair.eigenvalueImaginary };
  const imaginaryVector = pair.vectorImaginary ?? new Float64Array(pair.vector.length);
  let offset = 0;
  const ex: ComplexArray = {
    real: pair.vector.subarray(offset, offset + hySize),
    imaginary: imaginaryVector.subarray(offset, offset + hySize),
  };
  offset += hySize;
  const ey: ComplexArray = {
    real: pair.vector.subarray(offset, offset + hxSize),
    imaginary: imaginaryVector.subarray(offset, offset + hxSize),
  };
  offset += hxSize;
  const hx: ComplexArray = {
    real: pair.vector.subarray(offset, offset + hxSize),
    imaginary: imaginaryVector.subarray(offset, offset + hxSize),
  };
  offset += hxSize;
  const hy: ComplexArray = {
    real: pair.vector.subarray(offset, offset + hySize),
    imaginary: imaginaryVector.subarray(offset, offset + hySize),
  };

  const longitudinalPotential = complexSubtract(complexDyOperator(hx, grid), complexDxOperator(hy, grid));
  complexMultiplyInPlace(longitudinalPotential, grid.inverseEpsilonZ, grid.inverseEpsilonZImaginary);
  const ez = complexScaleScalar(longitudinalPotential, 0, -1 / k0);
  const hz = complexScaleScalar(complexSubtract(complexBy(ex, grid), complexBx(ey, grid)), 0, 1 / k0);

  const collocatedEx = complexAverage(ex, (part) => averageVertical(part, nx, ny));
  const collocatedEy = complexAverage(ey, (part) => averageHorizontal(part, nx, ny));
  const collocatedEz = complexAverage(ez, (part) => averageNodes(part, nx, ny));
  const collocatedHx = complexAverage(hx, (part) => averageHorizontal(part, nx, ny));
  const collocatedHy = complexAverage(hy, (part) => averageVertical(part, nx, ny));
  const collocatedHz = hz;
  rotateComplexFields([collocatedEx, collocatedEy, collocatedEz, collocatedHx, collocatedHy, collocatedHz]);
  return finalizeMode(pair, order, config, operator, betaComplex, [
    collocatedEx, collocatedEy, collocatedEz, collocatedHx, collocatedHy, collocatedHz,
  ]);
}

function buildMode(pair: RitzPair, order: number, config: WaveguideConfig, operator: OperatorContext): WaveguideMode {
  const { grid, hxSize, k0 } = operator;
  const { nx, ny } = grid;
  const betaComplex = complexSquareRoot(pair.eigenvalue, pair.eigenvalueImaginary);
  const beta = betaComplex.real;
  const imaginaryVector = pair.vectorImaginary ?? new Float64Array(pair.vector.length);
  const hx: ComplexArray = { real: pair.vector.subarray(0, hxSize), imaginary: imaginaryVector.subarray(0, hxSize) };
  const hy: ComplexArray = { real: pair.vector.subarray(hxSize), imaginary: imaginaryVector.subarray(hxSize) };
  const transverseDivergence = complexAdd(complexBx(hx, grid), complexBy(hy, grid));
  const longitudinalCurl = complexSubtract(complexDyOperator(hx, grid), complexDxOperator(hy, grid));
  complexMultiplyInPlace(longitudinalCurl, grid.inverseEpsilonZ, grid.inverseEpsilonZImaginary);
  const correction = complexSubtract(complexBx(complexAy(longitudinalCurl, grid), grid), complexBy(complexAx(longitudinalCurl, grid), grid));
  complexAddScaledInPlace(transverseDivergence, correction, 1 / k0 ** 2);
  const hz = complexDivideScalar(transverseDivergence, betaComplex.real, betaComplex.imaginary);
  const ex = complexSubtract(complexScaleScalar(hy, betaComplex.real, betaComplex.imaginary), complexCy(hz, grid));
  complexMultiplyInPlace(ex, grid.inverseEpsilonX, grid.inverseEpsilonXImaginary);
  complexMultiplyScalarInPlace(ex, 1 / k0);
  const ey = complexAdd(complexScaleScalar(hx, -betaComplex.real, -betaComplex.imaginary), complexCx(hz, grid));
  complexMultiplyInPlace(ey, grid.inverseEpsilonY, grid.inverseEpsilonYImaginary);
  complexMultiplyScalarInPlace(ey, 1 / k0);
  const ez = complexScaleScalar(longitudinalCurl, -1 / k0, 0);

  const collocatedEx = complexAverage(ex, (part) => averageVertical(part, nx, ny));
  const collocatedEy = complexAverage(ey, (part) => averageHorizontal(part, nx, ny));
  const collocatedEz = complexAverage(ez, (part) => averageNodes(part, nx, ny));
  const collocatedHx = complexAverage(hx, (part) => averageHorizontal(part, nx, ny));
  const collocatedHy = complexAverage(hy, (part) => averageVertical(part, nx, ny));
  const collocatedHz = hz;
  rotateComplexFields([collocatedEx, collocatedEy, collocatedEz, collocatedHx, collocatedHy, collocatedHz]);
  return finalizeMode(pair, order, config, operator, betaComplex, [
    collocatedEx, collocatedEy, collocatedEz, collocatedHx, collocatedHy, collocatedHz,
  ]);
}

function finalizeMode(
  pair: RitzPair,
  order: number,
  config: WaveguideConfig,
  operator: OperatorContext,
  betaComplex: { real: number; imaginary: number },
  fieldsAtCells: [ComplexArray, ComplexArray, ComplexArray, ComplexArray, ComplexArray, ComplexArray],
): WaveguideMode {
  const { grid, k0 } = operator;
  const { nx, ny } = grid;
  const [collocatedEx, collocatedEy, collocatedEz, collocatedHx, collocatedHy, collocatedHz] = fieldsAtCells;
  const beta = betaComplex.real;
  const electricIntensity = new Float64Array(nx * ny);
  const magneticIntensity = new Float64Array(nx * ny);
  const rawPoynting = new Float64Array(nx * ny);
  let electricTotal = 0;
  let electricCore = 0;
  let electricSquared = 0;
  let exEnergy = 0;
  let eyEnergy = 0;
  let ezEnergy = 0;
  let lossWeightedEnergy = 0;

  for (let index = 0; index < electricIntensity.length; index += 1) {
    const e2 = complexMagnitudeSquaredAt(collocatedEx, index) + complexMagnitudeSquaredAt(collocatedEy, index) + complexMagnitudeSquaredAt(collocatedEz, index);
    const h2 = complexMagnitudeSquaredAt(collocatedHx, index) + complexMagnitudeSquaredAt(collocatedHy, index) + complexMagnitudeSquaredAt(collocatedHz, index);
    electricIntensity[index] = e2;
    magneticIntensity[index] = h2;
    rawPoynting[index] = 0.5 * (
      collocatedEx.real[index] * collocatedHy.real[index] + collocatedEx.imaginary[index] * collocatedHy.imaginary[index]
      - collocatedEy.real[index] * collocatedHx.real[index] - collocatedEy.imaginary[index] * collocatedHx.imaginary[index]
    );
    const area = grid.cellArea[index];
    electricTotal += e2 * area;
    electricSquared += e2 ** 2 * area;
    exEnergy += complexMagnitudeSquaredAt(collocatedEx, index) * area;
    eyEnergy += complexMagnitudeSquaredAt(collocatedEy, index) * area;
    ezEnergy += complexMagnitudeSquaredAt(collocatedEz, index) * area;
    lossWeightedEnergy += grid.extinctionCell[index] * grid.epsilonCell[index] * e2 * area;
    electricCore += grid.coreFraction[index] * grid.epsilonCell[index] * e2 * area;
  }
  let weightedElectricTotal = 0;
  for (let index = 0; index < electricIntensity.length; index += 1) {
    weightedElectricTotal += grid.epsilonCell[index] * electricIntensity[index] * grid.cellArea[index];
  }

  const vacuumImpedanceOhm = 376.730313668;
  let powerForUnitMagneticFieldW = 0;
  for (let index = 0; index < rawPoynting.length; index += 1) {
    powerForUnitMagneticFieldW += vacuumImpedanceOhm * rawPoynting[index] * grid.cellArea[index] * 1e-12;
  }
  const hScale = 1 / Math.sqrt(Math.max(Math.abs(powerForUnitMagneticFieldW), 1e-30));
  const eScale = vacuumImpedanceOhm * hScale * Math.sign(powerForUnitMagneticFieldW || 1);
  const physicalEx = complexScaleScalar(collocatedEx, eScale, 0);
  const physicalEy = complexScaleScalar(collocatedEy, eScale, 0);
  const physicalEz = complexScaleScalar(collocatedEz, eScale, 0);
  const physicalHx = complexScaleScalar(collocatedHx, hScale, 0);
  const physicalHy = complexScaleScalar(collocatedHy, hScale, 0);
  const physicalHz = complexScaleScalar(collocatedHz, hScale, 0);
  const physicalIntensity = new Float64Array(nx * ny);
  const physicalPoynting = new Float64Array(nx * ny);
  let modalPowerW = 0;
  let corePowerW = 0;
  for (let index = 0; index < physicalIntensity.length; index += 1) {
    physicalIntensity[index] = complexMagnitudeSquaredAt(physicalEx, index) + complexMagnitudeSquaredAt(physicalEy, index) + complexMagnitudeSquaredAt(physicalEz, index);
    physicalPoynting[index] = 0.5 * (
      physicalEx.real[index] * physicalHy.real[index] + physicalEx.imaginary[index] * physicalHy.imaginary[index]
      - physicalEy.real[index] * physicalHx.real[index] - physicalEy.imaginary[index] * physicalHx.imaginary[index]
    );
    const cellPowerW = physicalPoynting[index] * grid.cellArea[index] * 1e-12;
    modalPowerW += cellPowerW;
    corePowerW += grid.coreFraction[index] * cellPowerW;
  }
  const fields: Record<FieldComponent, number[][]> = {
    Ex: toMatrix(physicalEx.real, nx, ny),
    Ey: toMatrix(physicalEy.real, nx, ny),
    Ez: toMatrix(physicalEz.real, nx, ny),
    Hx: toMatrix(physicalHx.real, nx, ny),
    Hy: toMatrix(physicalHy.real, nx, ny),
    Hz: toMatrix(physicalHz.real, nx, ny),
    intensity: toMatrix(physicalIntensity, nx, ny),
    poynting: toMatrix(physicalPoynting, nx, ny),
  };
  const transverseElectricEnergy = exEnergy + eyEnergy;
  const polarization = exEnergy >= eyEnergy ? "quasi-TE" : "quasi-TM";
  const classification = classifyField(polarization === "quasi-TE" ? fields.Ex : fields.Ey);
  const label = `${polarization === "quasi-TE" ? "TE" : "TM"}${classification.horizontalOrder}${classification.verticalOrder}`;
  const { exteriorIndex, maximumIndex } = guidanceBounds(config);
  const effectiveIndex = beta / k0;
  const guidanceMargin = effectiveIndex - exteriorIndex;
  const electricConfinement = electricCore / weightedElectricTotal;

  const bendRadiusUm = config.bendRadiusUm ?? 0;
  return {
    id: `${label}-${order}`,
    label,
    order,
    ...classification,
    polarization,
    effectiveIndex,
    effectiveIndexImaginary: Math.abs(betaComplex.imaginary / k0),
    propagationConstantPerUm: beta,
    residual: pair.residual,
    electricConfinement,
    corePowerFraction: corePowerW / modalPowerW,
    effectiveAreaUm2: electricTotal ** 2 / electricSquared,
    longitudinalElectricFraction: ezEnergy / electricTotal,
    xPolarizedElectricFraction: exEnergy / transverseElectricEnergy,
    lossDbPerCm: operator.complex
      ? (20 / Math.log(10)) * Math.abs(betaComplex.imaginary) * 10_000
      : (4 * Math.PI * 10_000 * 10 / Math.log(10) / config.wavelengthUm)
        * (lossWeightedEnergy / Math.max(weightedElectricTotal, 1e-30)),
    modalPowerW,
    peakPoyntingWPerM2: Math.max(...physicalPoynting),
    guidanceMargin,
    nearCutoff: guidanceMargin < Math.max(1e-3, 0.01 * (maximumIndex - exteriorIndex)) || electricConfinement < 0.02,
    ...(bendRadiusUm > 0 ? {
      bendRadiusUm,
      azimuthalModeNumber: beta * bendRadiusUm,
    } : {}),
    fields,
  };
}

function classifyField(field: number[][]): { horizontalOrder: number; verticalOrder: number; symmetryX: number; symmetryY: number } {
  let peakRow = 0;
  let peakColumn = 0;
  let peak = 0;
  for (let row = 0; row < field.length; row += 1) {
    for (let column = 0; column < field[row].length; column += 1) {
      if (Math.abs(field[row][column]) > peak) { peak = Math.abs(field[row][column]); peakRow = row; peakColumn = column; }
    }
  }
  return {
    horizontalOrder: countNodes(field[peakRow]),
    verticalOrder: countNodes(field.map((row) => row[peakColumn])),
    symmetryX: mirrorCorrelation(field, false),
    symmetryY: mirrorCorrelation(field, true),
  };
}

function countNodes(values: number[]): number {
  const threshold = Math.max(...values.map(Math.abs)) * 0.08;
  const significant = values.filter((value) => Math.abs(value) >= threshold);
  let nodes = 0;
  for (let index = 1; index < significant.length; index += 1) if (significant[index] * significant[index - 1] < 0) nodes += 1;
  return nodes;
}

function mirrorCorrelation(field: number[][], vertical: boolean): number {
  let numerator = 0;
  let denominator = 0;
  for (let row = 0; row < field.length; row += 1) {
    for (let column = 0; column < field[row].length; column += 1) {
      const mirrored = vertical ? field[field.length - 1 - row][column] : field[row][field[row].length - 1 - column];
      numerator += field[row][column] * mirrored;
      denominator += field[row][column] ** 2;
    }
  }
  return numerator / Math.max(denominator, 1e-30);
}

function complexSquareRoot(real: number, imaginary: number): { real: number; imaginary: number } {
  const magnitude = Math.hypot(real, imaginary);
  const rootReal = Math.sqrt(Math.max(0, (magnitude + real) / 2));
  return { real: rootReal, imaginary: Math.sign(imaginary || 1) * Math.sqrt(Math.max(0, (magnitude - real) / 2)) };
}

function ax(nodes: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[row * nx + column] = (nodes[row * (nx + 1) + column + 1] - nodes[row * (nx + 1) + column]) / dx[column];
    }
  }
  return output;
}

function ay(nodes: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      output[row * (nx + 1) + column] = (nodes[(row + 1) * (nx + 1) + column] - nodes[row * (nx + 1) + column]) / dy[row];
    }
  }
  return output;
}

function bx(edges: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (edges[row * (nx + 1) + column + 1] - edges[row * (nx + 1) + column]) / dx[column];
    }
  }
  return output;
}

function by(edges: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      output[cellIndex(row, column, nx)] = (edges[(row + 1) * nx + column] - edges[row * nx + column]) / dy[row];
    }
  }
  return output;
}

function cx(cells: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? cells[cellIndex(row, column - 1, nx)] : 0;
      const east = column < nx ? cells[cellIndex(row, column, nx)] : 0;
      output[row * (nx + 1) + column] = (east - west) / dx[column];
    }
  }
  return output;
}

function cy(cells: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = row > 0 ? cells[cellIndex(row - 1, column, nx)] : 0;
      const north = row < ny ? cells[cellIndex(row, column, nx)] : 0;
      output[row * nx + column] = (north - south) / dy[row];
    }
  }
  return output;
}

function dxOperator(edges: Float64Array, nx: number, ny: number, dx: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = column > 0 ? edges[row * nx + column - 1] : 0;
      const east = column < nx ? edges[row * nx + column] : 0;
      output[row * (nx + 1) + column] = (east - west) / dx[column];
    }
  }
  return output;
}

function dyOperator(edges: Float64Array, nx: number, ny: number, dy: number[]): Float64Array {
  const output = new Float64Array((ny + 1) * (nx + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = row > 0 ? edges[(row - 1) * (nx + 1) + column] : 0;
      const north = row < ny ? edges[row * (nx + 1) + column] : 0;
      output[row * (nx + 1) + column] = (north - south) / dy[row];
    }
  }
  return output;
}

function complexSlice(vector: Float64Array, start: number, length: number, vectorSize: number): ComplexArray {
  return { real: vector.subarray(start, start + length), imaginary: vector.subarray(vectorSize + start, vectorSize + start + length) };
}

function complexJoin(first: ComplexArray, second: ComplexArray): Float64Array {
  const vectorSize = first.real.length + second.real.length;
  const output = new Float64Array(2 * vectorSize);
  output.set(first.real, 0);
  output.set(second.real, first.real.length);
  output.set(first.imaginary, vectorSize);
  output.set(second.imaginary, vectorSize + first.real.length);
  return output;
}

function complexJoinMany(values: ComplexArray[]): Float64Array {
  const vectorSize = values.reduce((sum, value) => sum + value.real.length, 0);
  const output = new Float64Array(2 * vectorSize);
  let offset = 0;
  for (const value of values) { output.set(value.real, offset); offset += value.real.length; }
  offset = vectorSize;
  for (const value of values) { output.set(value.imaginary, offset); offset += value.imaginary.length; }
  return output;
}

function complexCopy(values: ComplexArray): ComplexArray {
  return { real: values.real.slice(), imaginary: values.imaginary.slice() };
}

function complexAdd(first: ComplexArray, second: ComplexArray): ComplexArray {
  return { real: add(first.real, second.real), imaginary: add(first.imaginary, second.imaginary) };
}

function complexSubtract(first: ComplexArray, second: ComplexArray): ComplexArray {
  return { real: subtract(first.real, second.real), imaginary: subtract(first.imaginary, second.imaginary) };
}

function complexAddScaledInPlace(target: ComplexArray, source: ComplexArray, factor: number): void {
  addScaledInPlace(target.real, source.real, factor);
  addScaledInPlace(target.imaginary, source.imaginary, factor);
}

function complexScaleScalar(values: ComplexArray, real: number, imaginary: number): ComplexArray {
  const output = { real: values.real.slice(), imaginary: values.imaginary.slice() };
  for (let index = 0; index < output.real.length; index += 1) {
    const nextReal = values.real[index] * real - values.imaginary[index] * imaginary;
    output.imaginary[index] = values.real[index] * imaginary + values.imaginary[index] * real;
    output.real[index] = nextReal;
  }
  return output;
}

function complexDivideScalar(values: ComplexArray, real: number, imaginary: number): ComplexArray {
  const denominator = real ** 2 + imaginary ** 2;
  return complexScaleScalar(values, real / denominator, -imaginary / denominator);
}

function complexMultiplyScalarInPlace(values: ComplexArray, factor: number): void {
  multiplyScalarInPlace(values.real, factor);
  multiplyScalarInPlace(values.imaginary, factor);
}

function complexAverage(values: ComplexArray, average: (part: Float64Array) => Float64Array): ComplexArray {
  return { real: average(values.real), imaginary: average(values.imaginary) };
}

function complexMagnitudeSquaredAt(values: ComplexArray, index: number): number {
  return values.real[index] ** 2 + values.imaginary[index] ** 2;
}

function rotateComplexFields(fields: ComplexArray[]): void {
  const reference = fields[0];
  let peak = 0;
  for (let index = 1; index < reference.real.length; index += 1) {
    if (complexMagnitudeSquaredAt(reference, index) > complexMagnitudeSquaredAt(reference, peak)) peak = index;
  }
  const phase = Math.atan2(reference.imaginary[peak], reference.real[peak]);
  const cosine = Math.cos(phase);
  const sine = Math.sin(phase);
  for (const field of fields) {
    for (let index = 0; index < field.real.length; index += 1) {
      const nextReal = field.real[index] * cosine + field.imaginary[index] * sine;
      field.imaginary[index] = field.imaginary[index] * cosine - field.real[index] * sine;
      field.real[index] = nextReal;
    }
  }
}

function complexMultiplyInPlace(target: ComplexArray, real: Float64Array, imaginary: Float64Array): void {
  for (let index = 0; index < target.real.length; index += 1) {
    const nextReal = target.real[index] * real[index] - target.imaginary[index] * imaginary[index];
    target.imaginary[index] = target.real[index] * imaginary[index] + target.imaginary[index] * real[index];
    target.real[index] = nextReal;
  }
}

function complexAddProductInPlace(target: ComplexArray, source: ComplexArray, real: Float64Array, imaginary: Float64Array, factor: number): void {
  for (let index = 0; index < target.real.length; index += 1) {
    target.real[index] += factor * (source.real[index] * real[index] - source.imaginary[index] * imaginary[index]);
    target.imaginary[index] += factor * (source.real[index] * imaginary[index] + source.imaginary[index] * real[index]);
  }
}

function complexMultiplyXInPlace(values: ComplexArray, metric: ComplexArray, xLength: number): void {
  for (let index = 0; index < values.real.length; index += 1) {
    const metricIndex = index % xLength;
    const nextReal = values.real[index] * metric.real[metricIndex] - values.imaginary[index] * metric.imaginary[metricIndex];
    values.imaginary[index] = values.real[index] * metric.imaginary[metricIndex] + values.imaginary[index] * metric.real[metricIndex];
    values.real[index] = nextReal;
  }
}

function complexAddXWeightedProductInPlace(
  target: ComplexArray,
  source: ComplexArray,
  weightReal: Float64Array | undefined,
  weightImaginary: Float64Array | undefined,
  metric: ComplexArray,
  factor: number,
  xLength: number,
): void {
  for (let index = 0; index < target.real.length; index += 1) {
    const metricIndex = index % xLength;
    const weightProductReal = (weightReal?.[index] ?? 1) * metric.real[metricIndex]
      - (weightImaginary?.[index] ?? 0) * metric.imaginary[metricIndex];
    const weightProductImaginary = (weightReal?.[index] ?? 1) * metric.imaginary[metricIndex]
      + (weightImaginary?.[index] ?? 0) * metric.real[metricIndex];
    target.real[index] += factor * (source.real[index] * weightProductReal - source.imaginary[index] * weightProductImaginary);
    target.imaginary[index] += factor * (source.real[index] * weightProductImaginary + source.imaginary[index] * weightProductReal);
  }
}

function complexDerivative(
  values: ComplexArray,
  derivative: (part: Float64Array) => Float64Array,
  stretchReal: Float64Array,
  stretchImaginary: Float64Array,
  stretchIndex: (index: number) => number,
): ComplexArray {
  const output = { real: derivative(values.real), imaginary: derivative(values.imaginary) };
  for (let index = 0; index < output.real.length; index += 1) {
    const factor = stretchIndex(index);
    const nextReal = output.real[index] * stretchReal[factor] - output.imaginary[index] * stretchImaginary[factor];
    output.imaginary[index] = output.real[index] * stretchImaginary[factor] + output.imaginary[index] * stretchReal[factor];
    output.real[index] = nextReal;
  }
  return output;
}

function complexAx(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => ax(part, grid.nx, grid.ny, grid.dxCell), grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary, (index) => index % grid.nx);
}

function complexAy(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => ay(part, grid.nx, grid.ny, grid.dyCell), grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary, (index) => Math.floor(index / (grid.nx + 1)));
}

function complexBx(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => bx(part, grid.nx, grid.ny, grid.dxCell), grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary, (index) => index % grid.nx);
}

function complexBy(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => by(part, grid.nx, grid.ny, grid.dyCell), grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary, (index) => Math.floor(index / grid.nx));
}

function complexCx(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => cx(part, grid.nx, grid.ny, grid.dxDual), grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
}

function complexCy(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => cy(part, grid.nx, grid.ny, grid.dyDual), grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, (index) => Math.floor(index / grid.nx));
}

function complexDxOperator(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => dxOperator(part, grid.nx, grid.ny, grid.dxDual), grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
}

function complexDyOperator(values: ComplexArray, grid: Grid): ComplexArray {
  return complexDerivative(values, (part) => dyOperator(part, grid.nx, grid.ny, grid.dyDual), grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, (index) => Math.floor(index / (grid.nx + 1)));
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

function averageCellsToVerticalEdges(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array((ny + 1) * nx);
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const south = values[cellIndex(clamp(row - 1, 0, ny - 1), column, nx)];
      const north = values[cellIndex(clamp(row, 0, ny - 1), column, nx)];
      output[row * nx + column] = (south + north) / 2;
    }
  }
  return output;
}

function averageCellsToHorizontalEdges(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array(ny * (nx + 1));
  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = values[cellIndex(row, clamp(column - 1, 0, nx - 1), nx)];
      const east = values[cellIndex(row, clamp(column, 0, nx - 1), nx)];
      output[row * (nx + 1) + column] = (west + east) / 2;
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

function multiplyCopy(values: Float64Array, weights: Float64Array): Float64Array {
  const output = values.slice();
  multiplyInPlace(output, weights);
  return output;
}

function multiplyScalarInPlace(target: Float64Array, factor: number): void {
  for (let index = 0; index < target.length; index += 1) target[index] *= factor;
}

function multiplyXInPlace(target: Float64Array, metric: Float64Array, xLength: number): void {
  for (let index = 0; index < target.length; index += 1) target[index] *= metric[index % xLength];
}

function addXWeightedProductInPlace(
  target: Float64Array,
  source: Float64Array,
  weights: Float64Array | undefined,
  metric: Float64Array,
  factor: number,
  xLength: number,
): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] += factor * source[index] * (weights?.[index] ?? 1) * metric[index % xLength];
  }
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
