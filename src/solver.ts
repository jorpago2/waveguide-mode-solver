import { EigenvalueDecomposition, Matrix } from "ml-matrix";
import {
  complexRefractiveIndex, evaluateMaterialPrincipalIndices, evaluateMetalPermittivity, evaluateTabulatedMaterial,
  isMetalMaterial, materialDefinition,
  opticAxisDirection, uniaxialPermittivityTensor, validateTabulatedMaterial,
  type MaterialId, type OpticAxis, type SymmetricTensor, type TabulatedMaterialData,
} from "./materials";
import { createRadialBendOperator } from "./radialBend";

type ModeSolverCoreModule = typeof import("./wasm/modeSolverCore");
let modeSolverCore: ModeSolverCoreModule | undefined;
let recycledArnoldiSubspace: { key: string; vectors: Float64Array[] } | undefined;
try {
  modeSolverCore = await import("./wasm/modeSolverCore");
} catch {
  // The diagonal and transverse-rotation TypeScript solvers remain available.
}

export type PhysicalFieldComponent = "Ex" | "Ey" | "Ez" | "Hx" | "Hy" | "Hz";
export type FieldComponent = PhysicalFieldComponent | "intensity" | "poynting";
export type GeometryType = "channel" | "rib" | "slot" | "multilayer" | "coupler";
export type BoundaryType = "hard" | "pml";
export type SymmetryBoundary = "none" | "pec" | "pmc";
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
  extinction: 50,
  dispersionPerUm: 1_000,
  gridResolution: 256,
  modeCount: 8,
  meshBias: 1.5,
  sweepPoints: 101,
  bendRadiusUm: 1_000_000,
} as const;

export const NORMALIZED_MODAL_POWER_W = 1e-3;

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
  symmetryX?: SymmetryBoundary;
  symmetryY?: SymmetryBoundary;
  periodicX?: boolean;
  periodicY?: boolean;
  blochPhaseXRad?: number;
  blochPhaseYRad?: number;
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
  targetEffectiveIndex?: number;
  targetEffectiveIndexImaginary?: number;
}

export interface ComplexFieldMatrix {
  real: number[][];
  imaginary: number[][];
}

export interface MaterialAbsorption {
  region: string;
  powerPerM: number;
  fraction: number;
}

export interface ModeCandidateDiagnostic {
  effectiveIndex: number;
  effectiveIndexImaginary: number;
  residual: number;
  status: "selected" | "available" | "outside-window" | "duplicate" | "poor-residual" | "pml-mode";
  reason: string;
  label?: string;
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
  energyConfinement: number;
  energyEffectiveAreaUm2: number;
  electricEnergyPerM: number;
  magneticEnergyPerM: number;
  storedEnergyPerM: number;
  energyVelocityMPerS: number;
  energyGroupIndex: number;
  energyMetricValidity: "lossless" | "weak-loss" | "diagnostic";
  maximumLossTangent: number;
  physicalClass: "guided" | "leaky" | "plasmonic" | "pml";
  pmlEnergyFraction: number;
  boundaryEnergyFraction: number;
  longitudinalElectricFraction: number;
  xPolarizedElectricFraction: number;
  lossDbPerCm: number;
  absorptionLossDbPerCm: number;
  radiationLossDbPerCm: number;
  propagationLengthUm: number;
  lossBalanceRelativeDifference: number;
  absorbedPowerPerM: number;
  materialAbsorption: MaterialAbsorption[];
  modalPowerW: number;
  peakPoyntingWPerM2: number;
  guidanceMargin: number;
  nearCutoff: boolean;
  bendRadiusUm?: number;
  azimuthalModeNumber?: number;
  fields: Record<FieldComponent, number[][]>;
  complexFields: Record<PhysicalFieldComponent, ComplexFieldMatrix>;
}

export interface SolverResult {
  modes: WaveguideMode[];
  xUm: number[];
  yUm: number[];
  xEdgesUm: number[];
  yEdgesUm: number[];
  permittivity: Record<"real" | "imaginary", Record<"x" | "y" | "z", number[][]>>;
  nx: number;
  ny: number;
  dxUm: number;
  dyUm: number;
  dxMaxUm: number;
  dyMaxUm: number;
  warnings: string[];
  candidates: ModeCandidateDiagnostic[];
  searchTargetEffectiveIndex: number;
  searchWindow: { minimum: number; maximum: number };
  arnoldiDimension: number;
  formulation: "transverse-h" | "transverse-e" | "first-order";
  backend: "TypeScript" | "Rust/WASM";
  symmetryReductionFactor: number;
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
  epsilonCellXZ: Float64Array;
  epsilonCellXZImaginary: Float64Array;
  epsilonCellYZ: Float64Array;
  epsilonCellYZImaginary: Float64Array;
  cellArea: Float64Array;
  coreFraction: Float64Array;
  lossRegions: Array<{
    region: string;
    fraction: Float64Array;
    epsilonReal: { x: number; y: number; z: number };
    epsilonImaginary: { x: number; y: number; z: number };
    energyDerivative: SymmetricTensor;
  }>;
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
  periodicX: boolean;
  periodicY: boolean;
  blochPhaseXRad: number;
  blochPhaseYRad: number;
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
  formulation: "transverse-h" | "transverse-e" | "first-order";
  linearSolver: "bicgstab" | "gmres" | "direct";
  backend: "TypeScript" | "Rust/WASM";
  solveShifted?: (shift: number, rightHandSide: Float64Array) => Float64Array;
  solveEigenpairs?: (
    shift: number,
    arnoldiDimension: number,
    requestedPairs: number,
    initialVector: Float64Array,
  ) => RitzPair[];
  reconstructTransverse?: (
    electricReal: Float64Array,
    electricImaginary: Float64Array,
    betaReal: number,
    betaImaginary: number,
  ) => { real: Float64Array; imaginary: Float64Array };
  liftEigenpair?: (pair: RitzPair) => RitzPair;
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
  if (!Number.isFinite(config.claddingIndex) || config.claddingIndex < 0 || config.claddingIndex > PARAMETER_MAXIMUMS.refractiveIndex) {
    errors.push(`Cladding index must be between 0 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
  }
  if (!Number.isFinite(config.coreIndex) || config.coreIndex < 0 || config.coreIndex > PARAMETER_MAXIMUMS.refractiveIndex) {
    errors.push(`Core index must be between 0 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
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
    config.targetEffectiveIndex, config.targetEffectiveIndexImaginary,
    config.blochPhaseXRad, config.blochPhaseYRad,
    config.coreOpticAxisTiltDeg, config.coreOpticAxisAzimuthDeg, config.claddingOpticAxisTiltDeg,
    config.claddingOpticAxisAzimuthDeg, config.substrateOpticAxisTiltDeg, config.substrateOpticAxisAzimuthDeg,
  ].every((value) => value === undefined || Number.isFinite(value));
  if (!finiteOptional) errors.push("Optional material and mesh values must be finite.");
  if (config.targetEffectiveIndex !== undefined && (config.targetEffectiveIndex <= 0 || config.targetEffectiveIndex > 100)) {
    errors.push("The real effective-index target must be greater than 0 and no larger than 100.");
  }
  if (config.targetEffectiveIndexImaginary !== undefined && (config.targetEffectiveIndexImaginary < 0 || config.targetEffectiveIndexImaginary > 100)) {
    errors.push("The imaginary effective-index target must be between 0 and 100.");
  }
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
  const symmetryX = config.symmetryX ?? "none";
  const symmetryY = config.symmetryY ?? "none";
  const periodicX = config.periodicX ?? false;
  const periodicY = config.periodicY ?? false;
  const blochPhaseX = config.blochPhaseXRad ?? 0;
  const blochPhaseY = config.blochPhaseYRad ?? 0;
  if (!["none", "pec", "pmc"].includes(symmetryX) || !["none", "pec", "pmc"].includes(symmetryY)) errors.push("Symmetry boundaries must be none, PEC or PMC.");
  if (Math.abs(blochPhaseX) > Math.PI || Math.abs(blochPhaseY) > Math.PI) errors.push("Bloch phases must stay between −π and π radians.");
  if ((!periodicX && Math.abs(blochPhaseX) > 1e-12) || (!periodicY && Math.abs(blochPhaseY) > 1e-12)) errors.push("A nonzero Bloch phase requires the corresponding periodic boundary.");
  if ((periodicX || periodicY) && (symmetryX !== "none" || symmetryY !== "none")) errors.push("Bloch-periodic and PEC/PMC symmetry boundaries cannot be combined in the same solve.");
  if (bendRadiusUm > 0 && (periodicX || periodicY)) errors.push("Bloch-periodic boundaries are currently limited to straight guides.");
  if (periodicY && ((config.geometry ?? "channel") === "multilayer" || (config.stackLayers?.length ?? 0) > 0)) errors.push("y periodicity requires matching top and bottom materials, so vertical stacks and multilayer substrates are not supported.");
  if ((config.boundary ?? "hard") === "pml" && periodicX && periodicY) errors.push("PML requires at least one non-periodic transverse axis.");
  if (bendRadiusUm > 0 && (symmetryX !== "none" || symmetryY !== "none")) errors.push("PEC/PMC symmetry planes are currently limited to straight guides.");
  if (symmetryY !== "none" && ((config.geometry ?? "channel") === "rib" || (config.geometry ?? "channel") === "multilayer"
    || (config.stackLayers?.length ?? 0) > 0 || Math.abs((config.sidewallAngleDeg ?? 90) - 90) > 1e-9)) {
    errors.push("y symmetry requires a vertically symmetric cross-section without rib, stack or angled sidewalls.");
  }
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
  if ((config.geometry ?? "channel") === "multilayer" && ((config.substrateIndex ?? 0) < 0 || (config.substrateIndex ?? 0) > PARAMETER_MAXIMUMS.refractiveIndex)) {
    errors.push(`Substrate index must be between 0 and ${PARAMETER_MAXIMUMS.refractiveIndex}.`);
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
    || layer.thicknessUm > PARAMETER_MAXIMUMS.dimensionUm || !Number.isFinite(layer.index) || layer.index < 0
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
    const substrateActive = (config.geometry ?? "channel") === "multilayer" || stackLayers.length > 0;
    const materialList = [materials.core, materials.cladding, ...(substrateActive ? [materials.substrate, ...materials.layers] : [])];
    const indices = materialList.flatMap((material) => [material.nx, material.ny, material.nz]);
    if (indices.some((value) => value < 0 || value > PARAMETER_MAXIMUMS.refractiveIndex)) errors.push(`Dispersive material indices must remain between 0 and ${PARAMETER_MAXIMUMS.refractiveIndex} at the solved wavelength.`);
    const hasMetal = materialList.some((material) => material.metallic);
    if (hasMetal && materialList.every((material) => material.metallic)) errors.push("A plasmonic mode requires an interface between a negative-permittivity material and a dielectric.");
    const coreMaximum = Math.max(materials.core.nx, materials.core.ny, materials.core.nz);
    const exteriorMaximum = Math.max(materials.cladding.nx, materials.cladding.ny, materials.cladding.nz,
      (config.geometry ?? "channel") === "multilayer" || stackLayers.length > 0 ? Math.max(materials.substrate.nx, materials.substrate.ny, materials.substrate.nz) : 0,
      ...materials.layers.flatMap((material) => [material.nx, material.ny, material.nz]));
    if (!hasMetal && coreMaximum <= exteriorMaximum) errors.push("The core must retain a larger principal index than the exterior materials.");
    const hasLongitudinalCoupling = materialList.some((material) => [material.epsilonReal.xz, material.epsilonReal.yz, material.epsilonImaginary.xz, material.epsilonImaginary.yz].some((value) => Math.abs(value) > 1e-12));
    const hasOffDiagonalRotation = materialList.some((material) => tensorHasOffDiagonal(material.epsilonReal, material.epsilonImaginary));
    const hasMaterialLoss = materialList.some((material) => Object.values(material.epsilonImaginary).some((value) => Math.abs(value) > 1e-12));
  if (hasLongitudinalCoupling && !modeSolverCore) errors.push("Longitudinal tensor coupling requires WebAssembly support in this browser.");
    if (hasOffDiagonalRotation && (hasMaterialLoss || (config.boundary ?? "hard") === "pml")) errors.push("Rotated anisotropy currently requires lossless materials and a hard outer boundary.");
    if (bendRadiusUm > 0 && materialList.some((material) => tensorHasOffDiagonal(material.epsilonReal, material.epsilonImaginary))) {
      errors.push("Rotated off-diagonal anisotropy is currently limited to straight guides; a constant local tensor is not rigorous along a curved crystal path.");
    }
    if (hasOffDiagonalRotation && (symmetryX !== "none" || symmetryY !== "none")) errors.push("PEC/PMC symmetry planes currently require diagonal material tensors.");
    if (hasOffDiagonalRotation && (periodicX || periodicY)) errors.push("Bloch-periodic boundaries currently require diagonal material tensors.");
    if (bendRadiusUm > 0 && hasMetal) errors.push("Metallic modes are currently limited to straight guides; curved-plasmonic validation is not yet available.");
  }
  return errors;
}

export function solveWaveguide(config: WaveguideConfig, recycleSubspace = false): SolverResult {
  const errors = validateWaveguide(config);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const grid = createGrid(config);
  const baseOperator = (config.bendRadiusUm ?? 0) > 0
    ? createBendOperator(grid, config)
    : gridHasOffDiagonalTensor(grid) ? createTensorOperator(grid, config.wavelengthUm)
      : createVectorOperator(grid, config.wavelengthUm);
  const operator = applySymmetryBoundaries(baseOperator, config);
  const requestedRitzPairs = Math.max(config.modeCount * (operator.eigenvaluePower === 1 ? 4 : 3), operator.eigenvaluePower === 1 ? 10 : 8);
  const arnoldiDimension = Math.min(
    operator.physicalVectorSize * (operator.complex ? 2 : 1) - 1,
    operator.formulation === "transverse-e" && operator.complex
      ? Math.max(48, config.modeCount * 10 + 12)
      : operator.formulation === "first-order" && (config.bendRadiusUm ?? 0) === 0
      ? Math.max(32, config.modeCount * 10 + 12)
      : Math.max(operator.complex ? (operator.eigenvaluePower === 1 ? 48 : 28) : 16, config.modeCount * (operator.complex ? 12 : 7) + (operator.eigenvaluePower === 1 ? 8 : 0)),
  );
  const pairs = solveLargestEigenpairs(operator, arnoldiDimension, requestedRitzPairs, config, recycleSubspace);
  const { lowerIndex, upperIndex } = guidanceBounds(config);
  const guidedPairs = pairs.filter((pair) => {
    const effectiveIndex = pairEffectiveIndex(pair, operator);
    return effectiveIndex > lowerIndex && effectiveIndex < upperIndex;
  });
  const uniquePairs = guidedPairs.filter((pair, index, all) => {
    const effectiveIndex = pairEffectiveIndex(pair, operator);
    return all.findIndex((candidate) => (
      Math.abs(pairEffectiveIndex(candidate, operator) - effectiveIndex) < 1e-7
    )) === index;
  });
  const convergedPairs = uniquePairs.filter((pair) => pair.residual <= 2e-2);
  const rebuild = (pair: RitzPair, index: number) => {
    const physicalPair = operator.liftEigenpair?.(pair) ?? pair;
    return operator.formulation === "transverse-e"
      ? buildReducedBendMode(physicalPair, index, config, operator)
      : operator.eigenvaluePower === 1
        ? buildFirstOrderMode(physicalPair, index, config, operator)
        : buildMode(physicalPair, index, config, operator);
  };
  const reconstructed = ((config.boundary ?? "hard") === "pml" ? convergedPairs : convergedPairs.slice(0, config.modeCount))
    .map((pair, index) => ({ pair, mode: rebuild(pair, index) }));
  const selected = reconstructed.filter(({ mode }) => mode.physicalClass !== "pml").slice(0, config.modeCount);
  const selectedPairs = selected.map(({ pair }) => pair);
  const modes = selected.map(({ mode }, index) => ({ ...mode, order: index, id: `${mode.label}-${index}` }));
  const candidates: ModeCandidateDiagnostic[] = pairs.map((pair) => {
    const effectiveIndex = pairEffectiveIndexComplex(pair, operator);
    const selectedIndex = selectedPairs.indexOf(pair);
    if (!guidedPairs.includes(pair)) return {
      effectiveIndex: effectiveIndex.real, effectiveIndexImaginary: effectiveIndex.imaginary,
      residual: pair.residual, status: "outside-window", reason: `Outside ${lowerIndex.toFixed(4)}–${upperIndex.toFixed(4)} search window.`,
    };
    if (!uniquePairs.includes(pair)) return {
      effectiveIndex: effectiveIndex.real, effectiveIndexImaginary: effectiveIndex.imaginary,
      residual: pair.residual, status: "duplicate", reason: "Duplicate Ritz value within 10⁻⁷ in effective index.",
    };
    if (!convergedPairs.includes(pair)) return {
      effectiveIndex: effectiveIndex.real, effectiveIndexImaginary: effectiveIndex.imaginary,
      residual: pair.residual, status: "poor-residual", reason: "Relative eigenpair residual exceeds 2 × 10⁻².",
    };
    const reconstructedMode = reconstructed.find((entry) => entry.pair === pair)?.mode;
    if (reconstructedMode?.physicalClass === "pml") return {
      effectiveIndex: effectiveIndex.real, effectiveIndexImaginary: effectiveIndex.imaginary,
      residual: pair.residual, status: "pml-mode", reason: `${(100 * reconstructedMode.pmlEnergyFraction).toFixed(1)}% of stored-energy magnitude lies inside the PML.`,
    };
    if (selectedIndex >= 0) return {
      effectiveIndex: effectiveIndex.real, effectiveIndexImaginary: effectiveIndex.imaginary,
      residual: pair.residual, status: "selected", reason: "Selected and reconstructed.", label: modes[selectedIndex].label,
    };
    return {
      effectiveIndex: effectiveIndex.real, effectiveIndexImaginary: effectiveIndex.imaginary,
      residual: pair.residual, status: "available", reason: "Converged candidate beyond the requested mode count.",
    };
  });

  const warnings: string[] = [];
  const cellsAcrossCore = Math.min(
    grid.x.filter((value) => Math.abs(value) <= config.widthUm / 2).length,
    grid.y.filter((value) => Math.abs(value) <= config.heightUm / 2).length,
  );
  if (cellsAcrossCore < 8) warnings.push("Fewer than 8 cells span the smallest core dimension; refine the grid before using quantitative values.");
  if (convergedPairs.length < uniquePairs.length) warnings.push(`${uniquePairs.length - convergedPairs.length} poorly converged mode${uniquePairs.length - convergedPairs.length === 1 ? " was" : "s were"} discarded because the field residual exceeded 2 × 10⁻².`);
  const pmlModes = reconstructed.filter(({ mode }) => mode.physicalClass === "pml").length;
  if (pmlModes > 0) warnings.push(`${pmlModes} PML-localized numerical mode${pmlModes === 1 ? " was" : "s were"} automatically excluded; confirm remaining leaky modes with the PML sensitivity analysis.`);
  if (modes.length < config.modeCount) warnings.push(`Only ${modes.length} guided mode${modes.length === 1 ? " was" : "s were"} found inside the modal search interval.`);
  if (modes.some((mode) => mode.residual > 2e-3)) warnings.push("One or more eigenpairs need review; reduce the requested mode count or mesh bias before interpreting the field profile.");
  if (config.targetEffectiveIndex !== undefined && (config.targetEffectiveIndex <= lowerIndex || config.targetEffectiveIndex >= upperIndex)) {
    warnings.push("The requested effective-index target lies outside the physical search window; inspect rejected candidates or revise the target.");
  }
  if ((config.bendRadiusUm ?? 0) > 0 && (config.boundary ?? "hard") !== "pml") warnings.push("A bent guide with hard walls cannot yield physical radiation loss; use PML and verify mesh, padding and absorber convergence.");
  if (config.periodicX || config.periodicY) warnings.push("Bloch-periodic boundaries model an infinite transverse array; the result is not an isolated-waveguide mode.");
  if (guidanceBounds(config).plasmonic) {
    warnings.push("Metal results use a local bulk permittivity model. Thin-film morphology, surface scattering and nonlocal response are not included.");
    warnings.push("Plasmonic fields vary sharply at interfaces; verify both mesh and domain-size convergence before using effective index or loss quantitatively.");
  }

  return {
    modes,
    xUm: grid.x,
    yUm: grid.y,
    xEdgesUm: grid.xNodes,
    yEdgesUm: grid.yNodes,
    permittivity: {
      real: {
        x: toMatrix(grid.epsilonCellX, grid.nx, grid.ny),
        y: toMatrix(grid.epsilonCellY, grid.nx, grid.ny),
        z: toMatrix(grid.epsilonCellZ, grid.nx, grid.ny),
      },
      imaginary: {
        x: toMatrix(grid.epsilonCellXImaginary, grid.nx, grid.ny),
        y: toMatrix(grid.epsilonCellYImaginary, grid.nx, grid.ny),
        z: toMatrix(grid.epsilonCellZImaginary, grid.nx, grid.ny),
      },
    },
    nx: grid.nx,
    ny: grid.ny,
    dxUm: grid.dx,
    dyUm: grid.dy,
    dxMaxUm: Math.max(...grid.dxCell),
    dyMaxUm: Math.max(...grid.dyCell),
    warnings,
    candidates,
    searchTargetEffectiveIndex: guidanceBounds(config).targetIndex,
    searchWindow: { minimum: lowerIndex, maximum: upperIndex },
    arnoldiDimension,
    formulation: operator.formulation,
    backend: operator.backend,
    symmetryReductionFactor: baseOperator.physicalVectorSize / operator.physicalVectorSize,
  };
}

function pairEffectiveIndex(pair: RitzPair, operator: OperatorContext): number {
  return pairEffectiveIndexComplex(pair, operator).real;
}

function pairEffectiveIndexComplex(pair: RitzPair, operator: OperatorContext): { real: number; imaginary: number } {
  const beta = operator.eigenvaluePower === 1
    ? { real: pair.eigenvalue, imaginary: pair.eigenvalueImaginary }
    : complexSquareRoot(pair.eigenvalue, pair.eigenvalueImaginary);
  return { real: beta.real / operator.k0, imaginary: Math.abs(beta.imaginary / operator.k0) };
}

export function sweepWaveguide(config: WaveguideConfig, settings: SweepSettings): SweepResult {
  recycledArnoldiSubspace = undefined;
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
  const tracked: Array<{ result: SolverResult; mode: WaveguideMode; overlap: number } | undefined> = new Array(settings.points);
  const solveAt = (index: number) => solveWaveguide({ ...config, wavelengthUm: wavelengths[index] }, true);
  const anchorResult = solveAt(anchor);
  if (anchorResult.modes.length === 0) throw new Error("No guided mode exists at the sweep anchor wavelength.");
  tracked[anchor] = { result: anchorResult, mode: anchorResult.modes[Math.min(settings.modeIndex, anchorResult.modes.length - 1)], overlap: 1 };
  const anchorSubspace = recycledArnoldiSubspace;

  for (const direction of [1, -1]) {
    recycledArnoldiSubspace = anchorSubspace;
    for (let index = anchor + direction; index >= 0 && index < wavelengths.length; index += direction) {
      const previous = tracked[index - direction];
      const candidateResult = solveAt(index);
      if (!previous || candidateResult.modes.length === 0) break;
      const matching = candidateResult.modes.filter((mode) => sameModeFamily(previous.mode, mode));
      const ranked = (matching.length > 0 ? matching : candidateResult.modes).map((mode) => ({
        result: candidateResult,
        mode,
        overlap: resampledModeOverlap(previous.result, previous.mode, candidateResult, mode),
      }))
        .sort((first, second) => second.overlap - first.overlap);
      tracked[index] = ranked[0];
    }
  }

  const valid = tracked.map((entry, index) => entry && ({ wavelengthUm: wavelengths[index], ...entry })).filter(Boolean) as Array<{
    wavelengthUm: number; result: SolverResult; mode: WaveguideMode; overlap: number;
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
  recycledArnoldiSubspace = undefined;
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
    return solveWaveguide(nextConfig, true);
  };
  const anchorResult = solveAt(anchor);
  if (!anchorResult?.modes.length) throw new Error("No guided mode exists at the geometry-sweep anchor.");
  tracked[anchor] = {
    result: anchorResult,
    mode: anchorResult.modes[Math.min(settings.modeIndex, anchorResult.modes.length - 1)],
    overlap: 1,
  };
  const anchorSubspace = recycledArnoldiSubspace;

  for (const direction of [1, -1]) {
    recycledArnoldiSubspace = anchorSubspace;
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
  epsilonReal: SymmetricTensor;
  epsilonImaginary: SymmetricTensor;
  metallic: boolean;
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
    if (isMetalMaterial(materialId)) {
      const epsilon = evaluateMetalPermittivity(materialId, config.wavelengthUm);
      const index = complexRefractiveIndex(epsilon);
      const zero = { xy: 0, xz: 0, yz: 0 };
      return {
        nx: index.n, ny: index.n, nz: index.n, metallic: epsilon.real < 0,
        epsilonReal: { xx: epsilon.real, yy: epsilon.real, zz: epsilon.real, ...zero },
        epsilonImaginary: { xx: epsilon.imaginary, yy: epsilon.imaginary, zz: epsilon.imaginary, ...zero },
      };
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
        epsilonReal,
        epsilonImaginary,
        metallic: false,
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

function materialEnergyDerivatives(config: WaveguideConfig): ReturnType<typeof materialValues> {
  const wavelength = config.wavelengthUm;
  const step = Math.max(1e-7, wavelength * 1e-4);
  const current = materialValues(config);
  const sample = (nextWavelength: number) => {
    try { return materialValues({ ...config, wavelengthUm: nextWavelength }); } catch { return undefined; }
  };
  const lower = sample(wavelength - step);
  const upper = sample(wavelength + step);
  const derivative = (value: MaterialValue, low: MaterialValue | undefined, high: MaterialValue | undefined): MaterialValue => {
    const tensor = (name: keyof SymmetricTensor) => {
      const slope = low && high
        ? (high.epsilonReal[name] - low.epsilonReal[name]) / (2 * step)
        : high ? (high.epsilonReal[name] - value.epsilonReal[name]) / step
          : low ? (value.epsilonReal[name] - low.epsilonReal[name]) / step : 0;
      return value.epsilonReal[name] - wavelength * slope;
    };
    return { ...value, epsilonReal: { xx: tensor("xx"), yy: tensor("yy"), zz: tensor("zz"), xy: tensor("xy"), xz: tensor("xz"), yz: tensor("yz") } };
  };
  return {
    core: derivative(current.core, lower?.core, upper?.core),
    cladding: derivative(current.cladding, lower?.cladding, upper?.cladding),
    substrate: derivative(current.substrate, lower?.substrate, upper?.substrate),
    layers: current.layers.map((value, index) => derivative(value, lower?.layers[index], upper?.layers[index])),
  };
}

function diagonalMaterial(nx: number, ny: number, nz: number, k: number): MaterialValue {
  const zero = { xy: 0, xz: 0, yz: 0 };
  return {
    nx, ny, nz,
    epsilonReal: { xx: nx ** 2 - k ** 2, yy: ny ** 2 - k ** 2, zz: nz ** 2 - k ** 2, ...zero },
    epsilonImaginary: { xx: 2 * nx * k, yy: 2 * ny * k, zz: 2 * nz * k, ...zero },
    metallic: [nx ** 2 - k ** 2, ny ** 2 - k ** 2, nz ** 2 - k ** 2].some((value) => value < 0),
  };
}

function complexIndexValue(permittivityReal: number, permittivityImaginary: number): number {
  return Math.sqrt((Math.hypot(permittivityReal, permittivityImaginary) + permittivityReal) / 2);
}

function tensorHasOffDiagonal(real: SymmetricTensor, imaginary: SymmetricTensor): boolean {
  return [real.xy, real.xz, real.yz, imaginary.xy, imaginary.xz, imaginary.yz].some((value) => Math.abs(value) > 1e-12);
}

interface GuidanceBounds {
  exteriorIndex: number;
  maximumIndex: number;
  targetIndex: number;
  lowerIndex: number;
  upperIndex: number;
  plasmonic: boolean;
}

function guidanceBounds(config: WaveguideConfig): GuidanceBounds {
  const values = materialValues(config);
  const maximum = (material: { nx: number; ny: number; nz: number }) => Math.max(material.nx, material.ny, material.nz);
  const hasSubstrate = (config.geometry ?? "channel") === "multilayer" || (config.stackLayers?.length ?? 0) > 0;
  const active = [values.core, values.cladding, ...(hasSubstrate ? [values.substrate, ...values.layers] : [])];
  const dielectric = active.filter((material) => !material.metallic);
  const metals = active.filter((material) => material.metallic);
  const exteriorIndex = dielectric.reduce((value, material) => Math.max(value, maximum(material)), 0);
  const maximumIndex = active.reduce((value, material) => Math.max(value, maximum(material)), 0);
  if (metals.length > 0 && dielectric.length > 0) {
    const targets = metals.flatMap((metal) => dielectric.map((medium) => surfacePlasmonIndex(metal, medium)))
      .filter((value) => Number.isFinite(value) && value > 0);
    const targetIndex = config.targetEffectiveIndex ?? (targets.length > 0 ? Math.max(...targets) : Math.max(exteriorIndex, 1));
    return {
      exteriorIndex,
      maximumIndex: Math.max(maximumIndex, targetIndex),
      targetIndex,
      lowerIndex: Math.max(1e-6, 0.5 * targetIndex),
      upperIndex: 2 * targetIndex,
      plasmonic: true,
    };
  }
  return {
    exteriorIndex: Math.max(maximum(values.cladding), hasSubstrate ? maximum(values.substrate) : 0, ...values.layers.map(maximum)),
    maximumIndex,
    targetIndex: config.targetEffectiveIndex ?? (0.55 * maximumIndex + 0.45 * Math.max(maximum(values.cladding), hasSubstrate ? maximum(values.substrate) : 0, ...values.layers.map(maximum))),
    lowerIndex: Math.max(maximum(values.cladding), hasSubstrate ? maximum(values.substrate) : 0, ...values.layers.map(maximum)) + 1e-5,
    upperIndex: maximumIndex * 1.01,
    plasmonic: false,
  };
}

function surfacePlasmonIndex(metal: MaterialValue, dielectric: MaterialValue): number {
  const metalEpsilon = { real: metal.epsilonReal.xx, imaginary: metal.epsilonImaginary.xx };
  const dielectricEpsilon = { real: dielectric.epsilonReal.xx, imaginary: dielectric.epsilonImaginary.xx };
  const numerator = {
    real: metalEpsilon.real * dielectricEpsilon.real - metalEpsilon.imaginary * dielectricEpsilon.imaginary,
    imaginary: metalEpsilon.real * dielectricEpsilon.imaginary + metalEpsilon.imaginary * dielectricEpsilon.real,
  };
  const denominator = {
    real: metalEpsilon.real + dielectricEpsilon.real,
    imaginary: metalEpsilon.imaginary + dielectricEpsilon.imaginary,
  };
  const magnitudeSquared = denominator.real ** 2 + denominator.imaginary ** 2;
  const ratio = {
    real: (numerator.real * denominator.real + numerator.imaginary * denominator.imaginary) / magnitudeSquared,
    imaginary: (numerator.imaginary * denominator.real - numerator.real * denominator.imaginary) / magnitudeSquared,
  };
  return complexSquareRoot(ratio.real, ratio.imaginary).real;
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

function materialComponentsAtCell(
  x0: number, x1: number, y0: number, y1: number,
  config: WaveguideConfig,
  material: ReturnType<typeof materialValues>,
): Array<{ region: string; fraction: number; value: MaterialValue }> {
  const core = coreFractionAtCell(x0, x1, y0, y1, config);
  const stack = stackFractions(y0, y1, config);
  const layerTotal = stack.layers.reduce((sum, fraction) => sum + fraction, 0);
  return [
    { region: "Core", fraction: core, value: material.core },
    { region: "Base substrate", fraction: stack.substrate, value: material.substrate },
    { region: "Cladding", fraction: Math.max(0, 1 - core - stack.substrate - layerTotal), value: material.cladding },
    ...stack.layers.map((fraction, index) => ({
      region: config.stackLayers?.[index]?.name || `Layer ${index + 1}`,
      fraction,
      value: material.layers[index],
    })),
  ];
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

function alignEdgesToInterfaces(edges: number[], interfaces: number[]): number[] {
  const aligned = edges.slice();
  const minimumSpacing = (edges[edges.length - 1] - edges[0]) / (edges.length - 1) * 0.05;
  const claimed = new Set<number>();
  for (const coordinate of [...new Set(interfaces)].sort((first, second) => first - second)) {
    if (coordinate <= aligned[0] || coordinate >= aligned[aligned.length - 1]) continue;
    let best = -1;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < aligned.length - 1; index += 1) {
      if (claimed.has(index) || coordinate - aligned[index - 1] < minimumSpacing || aligned[index + 1] - coordinate < minimumSpacing) continue;
      if (Math.abs(aligned[index] - coordinate) < distance) { best = index; distance = Math.abs(aligned[index] - coordinate); }
    }
    if (best >= 0) { aligned[best] = coordinate; claimed.add(best); }
  }
  return aligned;
}

function geometryInterfaces(config: WaveguideConfig): { x: number[]; y: number[] } {
  const geometry = config.geometry ?? "channel";
  const bottom = -config.heightUm / 2;
  const top = config.heightUm / 2;
  const expansion = sidewallExpansion(config);
  const x: number[] = [];
  const y = [bottom, top];
  if (geometry === "slot") {
    const gap = config.slotGapUm ?? config.widthUm / 5;
    x.push(-config.widthUm / 2, -gap / 2, gap / 2, config.widthUm / 2);
  } else if (geometry === "coupler") {
    const gap = config.couplerGapUm ?? config.widthUm / 2;
    const centers = [-gap / 2 - config.widthUm / 2, gap / 2 + config.widthUm / 2];
    for (const center of centers) x.push(
      center - config.widthUm / 2 - expansion, center - config.widthUm / 2,
      center + config.widthUm / 2, center + config.widthUm / 2 + expansion,
    );
  } else {
    x.push(-config.widthUm / 2 - expansion, -config.widthUm / 2, config.widthUm / 2, config.widthUm / 2 + expansion);
  }
  if (geometry === "rib") y.push(bottom + (config.slabHeightUm ?? config.heightUm / 2));
  let layerTop = bottom;
  for (const layer of config.stackLayers ?? []) { layerTop -= layer.thicknessUm; y.push(layerTop); }
  return { x, y };
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

export function resampledModeOverlap(
  firstResult: SolverResult,
  first: WaveguideMode,
  secondResult: SolverResult,
  second: WaveguideMode,
): number {
  let cross12 = { real: 0, imaginary: 0 };
  let cross11 = { real: 0, imaginary: 0 };
  let cross22 = { real: 0, imaginary: 0 };
  for (let row = 0; row < firstResult.yUm.length; row += 1) {
    for (let column = 0; column < firstResult.xUm.length; column += 1) {
      const sampleX = firstResult.xUm[column];
      const sampleY = firstResult.yUm[row];
      const secondFields = Object.fromEntries((["Ex", "Ey", "Hx", "Hy"] as const).map((component) => [
        component,
        sampleComplexField(second.complexFields[component], secondResult.xUm, secondResult.yUm, sampleX, sampleY),
      ])) as Record<"Ex" | "Ey" | "Hx" | "Hy", ComplexValue | undefined>;
      if (Object.values(secondFields).some((value) => value === undefined)) continue;
      const firstFields = Object.fromEntries((["Ex", "Ey", "Hx", "Hy"] as const).map((component) => [
        component,
        complexMatrixValue(first.complexFields[component], row, column),
      ])) as Record<"Ex" | "Ey" | "Hx" | "Hy", ComplexValue>;
      const sampled = secondFields as Record<"Ex" | "Ey" | "Hx" | "Hy", ComplexValue>;
      const area = coordinateSpacing(firstResult.xUm, column) * coordinateSpacing(firstResult.yUm, row);
      cross12 = complexValueAdd(cross12, complexValueScale(complexValueAdd(
        transverseCross(firstFields, sampled), transverseCross(sampled, firstFields),
      ), area));
      cross11 = complexValueAdd(cross11, complexValueScale(transverseCross(firstFields, firstFields), 2 * area));
      cross22 = complexValueAdd(cross22, complexValueScale(transverseCross(sampled, sampled), 2 * area));
    }
  }
  const numerator = Math.hypot(cross12.real, cross12.imaginary);
  const denominator = Math.sqrt(Math.max(
    Math.hypot(cross11.real, cross11.imaginary) * Math.hypot(cross22.real, cross22.imaginary), 1e-30,
  ));
  return clamp(numerator / denominator, 0, 1);
}

interface ComplexValue { real: number; imaginary: number }

function complexMatrixValue(field: ComplexFieldMatrix, row: number, column: number): ComplexValue {
  return { real: field.real[row][column], imaginary: field.imaginary[row][column] };
}

function complexValueMultiply(first: ComplexValue, second: ComplexValue): ComplexValue {
  return {
    real: first.real * second.real - first.imaginary * second.imaginary,
    imaginary: first.real * second.imaginary + first.imaginary * second.real,
  };
}

function complexValueAdd(first: ComplexValue, second: ComplexValue): ComplexValue {
  return { real: first.real + second.real, imaginary: first.imaginary + second.imaginary };
}

function complexValueScale(value: ComplexValue, factor: number): ComplexValue {
  return { real: value.real * factor, imaginary: value.imaginary * factor };
}

function transverseCross(
  electric: Record<"Ex" | "Ey", ComplexValue>,
  magnetic: Record<"Hx" | "Hy", ComplexValue>,
): ComplexValue {
  const first = complexValueMultiply(electric.Ex, magnetic.Hy);
  const second = complexValueMultiply(electric.Ey, magnetic.Hx);
  return { real: first.real - second.real, imaginary: first.imaginary - second.imaginary };
}

function coordinateSpacing(coordinates: number[], index: number): number {
  if (index === 0) return coordinates[1] - coordinates[0];
  if (index === coordinates.length - 1) return coordinates[index] - coordinates[index - 1];
  return (coordinates[index + 1] - coordinates[index - 1]) / 2;
}

function bilinearSample(field: number[][], x: number[], y: number[], sampleX: number, sampleY: number): number | undefined {
  if (sampleX < x[0] || sampleX > x[x.length - 1] || sampleY < y[0] || sampleY > y[y.length - 1]) return undefined;
  const column = Math.min(lowerIndex(x, sampleX), x.length - 2);
  const row = Math.min(lowerIndex(y, sampleY), y.length - 2);
  if (column < 0 || row < 0) return undefined;
  const tx = (sampleX - x[column]) / (x[column + 1] - x[column]);
  const ty = (sampleY - y[row]) / (y[row + 1] - y[row]);
  const lower = field[row][column] * (1 - tx) + field[row][column + 1] * tx;
  const upper = field[row + 1][column] * (1 - tx) + field[row + 1][column + 1] * tx;
  return lower * (1 - ty) + upper * ty;
}

export function interpolateFieldMatrix(
  field: number[][], x: number[], y: number[], factor: number,
): { x: number[]; y: number[]; values: number[][] } {
  if (!Number.isInteger(factor) || factor < 1) throw new Error("Display interpolation factor must be a positive integer.");
  if (x.length < 2 || y.length < 2 || field.length !== y.length || field.some((row) => row.length !== x.length)) {
    throw new Error("Field dimensions must match the display coordinates.");
  }
  if (factor === 1) return { x, y, values: field };
  const denseX = densifyCoordinates(x, factor);
  const denseY = densifyCoordinates(y, factor);
  return {
    x: denseX,
    y: denseY,
    values: denseY.map((sampleY) => denseX.map((sampleX) => bilinearSample(field, x, y, sampleX, sampleY)!)),
  };
}

function densifyCoordinates(values: number[], factor: number): number[] {
  return values.flatMap((value, index) => index === values.length - 1
    ? [value]
    : Array.from({ length: factor }, (_, offset) => value + (values[index + 1] - value) * offset / factor));
}

function sampleComplexField(
  field: ComplexFieldMatrix, x: number[], y: number[], sampleX: number, sampleY: number,
): ComplexValue | undefined {
  const real = bilinearSample(field.real, x, y, sampleX, sampleY);
  const imaginary = bilinearSample(field.imaginary, x, y, sampleX, sampleY);
  return real === undefined || imaginary === undefined ? undefined : { real, imaginary };
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
  const interfaces = geometryInterfaces(config);
  const baseXEdges = stretchedEdges(domainWidth, nx, config.meshBias ?? 0);
  const baseYEdges = stretchedEdges(domainHeight, ny, config.meshBias ?? 0);
  // ponytail: coarse meshes retain smooth grading; interface snapping starts when each feature can keep distinct cells.
  const xEdges = config.gridResolution >= 48 ? alignEdgesToInterfaces(baseXEdges, interfaces.x) : baseXEdges;
  const yEdges = config.gridResolution >= 48 ? alignEdgesToInterfaces(baseYEdges, interfaces.y) : baseYEdges;
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
  const epsilonCellXZ = new Float64Array(nx * ny);
  const epsilonCellXZImaginary = new Float64Array(nx * ny);
  const epsilonCellYZ = new Float64Array(nx * ny);
  const epsilonCellYZImaginary = new Float64Array(nx * ny);
  const epsilonCell = new Float64Array(nx * ny);
  const cellArea = new Float64Array(nx * ny);
  const coreFraction = new Float64Array(nx * ny);
  const material = materialValues(config);
  const energyDerivative = materialEnergyDerivatives(config);
  const lossRegions = [
    { region: "Core", value: material.core, derivative: energyDerivative.core },
    { region: "Base substrate", value: material.substrate, derivative: energyDerivative.substrate },
    { region: "Cladding", value: material.cladding, derivative: energyDerivative.cladding },
    ...material.layers.map((value, index) => ({ region: config.stackLayers?.[index]?.name || `Layer ${index + 1}`, value, derivative: energyDerivative.layers[index] })),
  ].map(({ region, value, derivative }) => ({
    region,
    fraction: new Float64Array(nx * ny),
    epsilonReal: { x: value.epsilonReal.xx, y: value.epsilonReal.yy, z: value.epsilonReal.zz },
    epsilonImaginary: { x: value.epsilonImaginary.xx, y: value.epsilonImaginary.yy, z: value.epsilonImaginary.zz },
    energyDerivative: derivative.epsilonReal,
  }));

  for (let row = 0; row < ny; row += 1) {
    for (let column = 0; column < nx; column += 1) {
      const index = cellIndex(row, column, nx);
      const components = materialComponentsAtCell(xEdges[column], xEdges[column + 1], yEdges[row], yEdges[row + 1], config, material);
      coreFraction[index] = components[0].fraction;
      components.forEach((component, regionIndex) => { lossRegions[regionIndex].fraction[index] = component.fraction; });
      epsilonCellX[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.xx, 0);
      epsilonCellY[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.yy, 0);
      epsilonCellZ[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.zz, 0);
      epsilonCellXY[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.xy, 0);
      epsilonCellXZ[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.xz, 0);
      epsilonCellYZ[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonReal.yz, 0);
      epsilonCellXImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.xx, 0);
      epsilonCellYImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.yy, 0);
      epsilonCellZImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.zz, 0);
      epsilonCellXYImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.xy, 0);
      epsilonCellXZImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.xz, 0);
      epsilonCellYZImaginary[index] = components.reduce((sum, component) => sum + component.fraction * component.value.epsilonImaginary.yz, 0);
      epsilonCell[index] = (epsilonCellX[index] + epsilonCellY[index] + epsilonCellZ[index]) / 3;
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
  const xCellStretch = stretchProfile(x, domainWidth / 2, config.periodicX ? 0 : pmlThickness, pmlStrength);
  const yCellStretch = stretchProfile(y, domainHeight / 2, config.periodicY ? 0 : pmlThickness, pmlStrength);
  const xNodeStretch = stretchProfile(xEdges, domainWidth / 2, config.periodicX ? 0 : pmlThickness, pmlStrength);
  const yNodeStretch = stretchProfile(yEdges, domainHeight / 2, config.periodicY ? 0 : pmlThickness, pmlStrength);

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
    epsilonCellXZ,
    epsilonCellXZImaginary,
    epsilonCellYZ,
    epsilonCellYZImaginary,
    cellArea,
    coreFraction,
    lossRegions,
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
    periodicX: config.periodicX ?? false,
    periodicY: config.periodicY ?? false,
    blochPhaseXRad: config.blochPhaseXRad ?? 0,
    blochPhaseYRad: config.blochPhaseYRad ?? 0,
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
  const reducedHxSize = ny * (grid.periodicX ? nx : nx + 1);
  const reducedHySize = (grid.periodicY ? ny : ny + 1) * nx;
  const reducedSize = reducedHxSize + reducedHySize;
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
  const complex = grid.periodicX || grid.periodicY || grid.epsilonXImaginary.some((value) => value !== 0)
    || grid.epsilonYImaginary.some((value) => value !== 0)
    || grid.inverseStretchXCellImaginary.some((value) => value !== 0)
    || grid.inverseStretchYCellImaginary.some((value) => value !== 0);
  let apply = complex ? (vector: Float64Array): Float64Array => {
    const hx = expandBlochHx(complexSlice(vector, 0, reducedHxSize, reducedSize), grid);
    const hy = expandBlochHy(complexSlice(vector, reducedHxSize, reducedHySize, reducedSize), grid);
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
    return complexJoin(restrictBlochHx(outputHx, grid), restrictBlochHy(outputHy, grid));
  } : applyReal;
  let solveEigenpairs: OperatorContext["solveEigenpairs"];
  if (modeSolverCore) {
    modeSolverCore.configureVectorOperator(nx, ny, k0, grid.periodicX, grid.blochPhaseXRad, grid.periodicY, grid.blochPhaseYRad, [
      Float64Array.from(dxCell), Float64Array.from(dyCell),
      Float64Array.from(dxDual), Float64Array.from(dyDual),
      epsilonX, grid.epsilonXImaginary,
      epsilonY, grid.epsilonYImaginary,
      inverseEpsilonZ, grid.inverseEpsilonZImaginary,
      grid.inverseStretchXCellReal, grid.inverseStretchXCellImaginary,
      grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary,
      grid.inverseStretchYCellReal, grid.inverseStretchYCellImaginary,
      grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary,
    ]);
    apply = modeSolverCore.applyConfiguredOperator;
    solveEigenpairs = modeSolverCore.solveConfiguredEigenpairs;
  }
  const liftEigenpair = grid.periodicX || grid.periodicY ? (pair: RitzPair): RitzPair => {
    const imaginary = pair.vectorImaginary ?? new Float64Array(reducedSize);
    const hx = expandBlochHx({ real: pair.vector.subarray(0, reducedHxSize), imaginary: imaginary.subarray(0, reducedHxSize) }, grid);
    const hy = expandBlochHy({ real: pair.vector.subarray(reducedHxSize), imaginary: imaginary.subarray(reducedHxSize) }, grid);
    const fullReal = new Float64Array(hxSize + hySize);
    const fullImaginary = new Float64Array(hxSize + hySize);
    fullReal.set(hx.real); fullReal.set(hy.real, hxSize);
    fullImaginary.set(hx.imaginary); fullImaginary.set(hy.imaginary, hxSize);
    return { ...pair, vector: fullReal, vectorImaginary: fullImaginary };
  } : undefined;

  return { grid, k0, hxSize, hySize, apply, complex, physicalVectorSize: reducedSize, eigenvaluePower: 2, formulation: "transverse-h", linearSolver: "bicgstab", backend: solveEigenpairs ? "Rust/WASM" : "TypeScript", solveEigenpairs, liftEigenpair };
}

function gridHasOffDiagonalTensor(grid: Grid): boolean {
  return [grid.epsilonCellXY, grid.epsilonCellXYImaginary, grid.epsilonCellXZ,
    grid.epsilonCellXZImaginary, grid.epsilonCellYZ, grid.epsilonCellYZImaginary]
    .some((component) => component.some((value) => Math.abs(value) > 1e-12));
}

function createTensorOperator(grid: Grid, wavelengthUm: number): OperatorContext {
  const { nx, ny } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const physicalVectorSize = 2 * (hxSize + hySize);
  const k0 = 2 * Math.PI / wavelengthUm;
  const applyTypeScript = (vector: Float64Array): Float64Array => {
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
  let apply = applyTypeScript;
  let solveEigenpairs: OperatorContext["solveEigenpairs"];
  if (modeSolverCore) {
    modeSolverCore.configureTensorOperator(nx, ny, k0, [
      Float64Array.from(grid.dxCell), Float64Array.from(grid.dyCell),
      Float64Array.from(grid.dxDual), Float64Array.from(grid.dyDual),
      grid.epsilonCellX, grid.epsilonCellY, grid.epsilonCellZ,
      grid.epsilonCellXY, grid.epsilonCellXZ, grid.epsilonCellYZ,
    ]);
    apply = modeSolverCore.applyConfiguredOperator;
    solveEigenpairs = modeSolverCore.solveConfiguredEigenpairs;
  }
  return { grid, k0, hxSize, hySize, apply, complex: false, physicalVectorSize, eigenvaluePower: 1, formulation: "first-order", linearSolver: "bicgstab", backend: solveEigenpairs ? "Rust/WASM" : "TypeScript", solveEigenpairs };
}

function createBendOperator(grid: Grid, config: WaveguideConfig): OperatorContext {
  const { nx, ny } = grid;
  const hxSize = ny * (nx + 1);
  const hySize = (ny + 1) * nx;
  const k0 = 2 * Math.PI / config.wavelengthUm;
  const signedRadius = (config.bendDirection ?? "positive-x") === "positive-x"
    ? config.bendRadiusUm as number
    : -(config.bendRadiusUm as number);
  const bendOperator = createRadialBendOperator(grid, config.wavelengthUm, signedRadius);
  return {
    grid,
    k0,
    hxSize,
    hySize,
    apply: bendOperator.apply,
    complex: bendOperator.complex,
    physicalVectorSize: bendOperator.size,
    eigenvaluePower: 2,
    formulation: "transverse-e",
    linearSolver: "direct",
    backend: "Rust/WASM",
    solveShifted: bendOperator.solveShifted,
    solveEigenpairs: bendOperator.complex ? undefined : bendOperator.solveEigenpairs,
    reconstructTransverse: bendOperator.reconstructMagnetic,
  };
}

function applySymmetryBoundaries(operator: OperatorContext, config: WaveguideConfig): OperatorContext {
  const symmetryX = config.symmetryX ?? "none";
  const symmetryY = config.symmetryY ?? "none";
  if (symmetryX === "none" && symmetryY === "none") return operator;
  if (operator.formulation !== "transverse-h") throw new Error("Symmetry projection requires the transverse-H formulation.");

  const { nx, ny } = operator.grid;
  const fullSize = operator.physicalVectorSize;
  const mirrorX = new Int32Array(fullSize);
  const mirrorY = new Int32Array(fullSize);
  const signX = new Int8Array(fullSize).fill(1);
  const signY = new Int8Array(fullSize).fill(1);
  const components = [
    { offset: 0, rows: ny, columns: nx + 1, xParity: symmetryX === "pec" ? -1 : 1, yParity: symmetryY === "pec" ? 1 : -1 },
    { offset: operator.hxSize, rows: ny + 1, columns: nx, xParity: symmetryX === "pec" ? 1 : -1, yParity: symmetryY === "pec" ? -1 : 1 },
  ];
  for (const component of components) {
    for (let row = 0; row < component.rows; row += 1) {
      for (let column = 0; column < component.columns; column += 1) {
        const index = component.offset + row * component.columns + column;
        mirrorX[index] = component.offset + row * component.columns + component.columns - 1 - column;
        mirrorY[index] = component.offset + (component.rows - 1 - row) * component.columns + column;
        signX[index] = component.xParity;
        signY[index] = component.yParity;
      }
    }
  }

  const reducedIndex = new Int32Array(fullSize).fill(-1);
  const coefficient = new Float64Array(fullSize);
  const visited = new Uint8Array(fullSize);
  let reducedSize = 0;
  for (let start = 0; start < fullSize; start += 1) {
    if (visited[start]) continue;
    const orbit = new Map<number, number>([[start, 1]]);
    const queue = [start];
    let compatible = true;
    while (queue.length > 0) {
      const index = queue.pop() as number;
      const transformations: Array<[number, number]> = [];
      if (symmetryX !== "none") transformations.push([mirrorX[index], orbit.get(index) as number * signX[index]]);
      if (symmetryY !== "none") transformations.push([mirrorY[index], orbit.get(index) as number * signY[index]]);
      for (const [image, sign] of transformations) {
        const previous = orbit.get(image);
        if (previous !== undefined) { if (previous !== sign) compatible = false; continue; }
        orbit.set(image, sign);
        queue.push(image);
      }
    }
    orbit.forEach((_, index) => { visited[index] = 1; });
    if (!compatible) continue;
    const normalization = Math.sqrt(orbit.size);
    orbit.forEach((sign, index) => {
      reducedIndex[index] = reducedSize;
      coefficient[index] = sign / normalization;
    });
    reducedSize += 1;
  }

  const expandPhysical = (reduced: Float64Array) => {
    const full = new Float64Array(fullSize);
    for (let index = 0; index < fullSize; index += 1) {
      const column = reducedIndex[index];
      if (column >= 0) full[index] = coefficient[index] * reduced[column];
    }
    return full;
  };
  const restrictPhysical = (full: Float64Array) => {
    const reduced = new Float64Array(reducedSize);
    for (let index = 0; index < fullSize; index += 1) {
      const column = reducedIndex[index];
      if (column >= 0) reduced[column] += coefficient[index] * full[index];
    }
    return reduced;
  };
  const apply = (vector: Float64Array) => {
    if (!operator.complex) return restrictPhysical(operator.apply(expandPhysical(vector)));
    const full = complexBlock(expandPhysical(vector.subarray(0, reducedSize)), expandPhysical(vector.subarray(reducedSize)));
    const output = operator.apply(full);
    return complexBlock(restrictPhysical(output.subarray(0, fullSize)), restrictPhysical(output.subarray(fullSize)));
  };
  const liftEigenpair = (pair: RitzPair): RitzPair => ({
    ...pair,
    vector: expandPhysical(pair.vector),
    ...(pair.vectorImaginary ? { vectorImaginary: expandPhysical(pair.vectorImaginary) } : {}),
  });
  return {
    ...operator,
    apply,
    physicalVectorSize: reducedSize,
    solveEigenpairs: undefined,
    solveShifted: undefined,
    linearSolver: "bicgstab",
    liftEigenpair,
  };
}

function solveLargestEigenpairs(
  operator: OperatorContext,
  arnoldiDimension: number,
  requestedPairs: number,
  config: WaveguideConfig,
  recycleSubspace: boolean,
): RitzPair[] {
  const physicalVectorSize = operator.physicalVectorSize;
  const vectorSize = physicalVectorSize * (operator.complex ? 2 : 1);
  const { targetIndex, lowerIndex, upperIndex, plasmonic } = guidanceBounds(config);
  const shift = (operator.k0 * targetIndex) ** operator.eigenvaluePower;
  const basis: Float64Array[] = [];
  const hessenberg = Array.from({ length: arnoldiDimension + 1 }, () => new Float64Array(arnoldiDimension));
  const recycleKey = `${operator.formulation}:${operator.eigenvaluePower}:${operator.complex}:${vectorSize}`;
  let vector = deterministicUnitVector(vectorSize);
  if (recycleSubspace && recycledArnoldiSubspace?.key === recycleKey) {
    multiplyScalarInPlace(vector, 0.2);
    recycledArnoldiSubspace.vectors.forEach((recycled, index) => addScaledInPlace(vector, recycled, 1 / (index + 1)));
    multiplyScalarInPlace(vector, 1 / Math.max(norm(vector), 1e-30));
  }
  const finish = (candidates: RitzPair[]): RitzPair[] => {
    const targetImaginary = config.targetEffectiveIndexImaginary ?? 0;
    const targetDistance = (pair: RitzPair) => {
      const index = pairEffectiveIndexComplex(pair, operator);
      return Math.hypot(index.real - targetIndex, index.imaginary - targetImaginary);
    };
    const sorted = candidates.sort((first, second) => (plasmonic || config.targetEffectiveIndex !== undefined)
      ? targetDistance(first) - targetDistance(second)
      : second.eigenvalue - first.eigenvalue);
    const reusable = sorted.filter((pair) => {
      const index = pairEffectiveIndex(pair, operator);
      return index > lowerIndex && index < upperIndex;
    }).slice(0, 3).map((pair) => operator.complex
      ? complexBlock(pair.vector, pair.vectorImaginary as Float64Array)
      : pair.vector.slice());
    if (recycleSubspace && reusable.length > 0) recycledArnoldiSubspace = { key: recycleKey, vectors: reusable };
    return sorted.slice(0, requestedPairs);
  };
  if (operator.solveEigenpairs) {
    return finish(operator.solveEigenpairs(shift, arnoldiDimension, requestedPairs, vector));
  }

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

  const candidateFromVector = (
    ritzVector: Float64Array,
    ritzVectorImaginary: Float64Array | undefined,
    inverseReal: number,
    inverseImaginary: number,
  ): RitzPair | undefined => {
    const inverseMagnitudeSquared = inverseReal ** 2 + inverseImaginary ** 2;
    if (inverseMagnitudeSquared < 1e-24) return undefined;
    const eigenvalue = shift + inverseReal / inverseMagnitudeSquared;
    const eigenvalueImaginary = -inverseImaginary / inverseMagnitudeSquared;
    if (!(eigenvalue > 0)) return undefined;
    const vectorNorm = Math.sqrt(norm(ritzVector) ** 2 + (ritzVectorImaginary ? norm(ritzVectorImaginary) ** 2 : 0));
    if (vectorNorm < 1e-12) return undefined;
    multiplyScalarInPlace(ritzVector, 1 / vectorNorm);
    if (ritzVectorImaginary) multiplyScalarInPlace(ritzVectorImaginary, 1 / vectorNorm);
    const residualInput = operator.complex
      ? complexBlock(ritzVector, ritzVectorImaginary as Float64Array)
      : ritzVector;
    const residualVector = operator.apply(residualInput);
    addComplexEigenvalueInPlace(residualVector, residualInput, eigenvalue, eigenvalueImaginary, operator.complex);
    return {
      eigenvalue,
      eigenvalueImaginary,
      vector: ritzVector,
      vectorImaginary: ritzVectorImaginary,
      residual: norm(residualVector) / Math.max(Math.hypot(eigenvalue, eigenvalueImaginary), 1),
    };
  };

  for (let column = 0; column < dimension; column += 1) {
    const inverseReal = decomposition.realEigenvalues[column];
    const inverseImaginary = decomposition.imaginaryEigenvalues[column];
    if (!operator.complex && Math.abs(inverseImaginary) > 1e-7) continue;
    const ritzBlockReal = new Float64Array(vectorSize);
    for (let basisIndex = 0; basisIndex < dimension; basisIndex += 1) {
      addScaledInPlace(ritzBlockReal, basis[basisIndex], eigenvectors.get(basisIndex, column));
    }

    if (!operator.complex) {
      const candidate = candidateFromVector(ritzBlockReal, undefined, inverseReal, inverseImaginary);
      if (candidate) candidates.push(candidate);
      continue;
    }

    if (Math.abs(inverseImaginary) <= 1e-10) {
      const ritzVector = ritzBlockReal.slice(0, physicalVectorSize);
      const ritzVectorImaginary = ritzBlockReal.slice(physicalVectorSize);
      const candidate = candidateFromVector(ritzVector, ritzVectorImaginary, inverseReal, 0);
      if (candidate) candidates.push(candidate);
      continue;
    }

    if (inverseImaginary < 0 || column + 1 >= dimension) continue;
    const ritzBlockImaginary = new Float64Array(vectorSize);
    for (let basisIndex = 0; basisIndex < dimension; basisIndex += 1) {
      addScaledInPlace(ritzBlockImaginary, basis[basisIndex], eigenvectors.get(basisIndex, column + 1));
    }
    const alternatives: RitzPair[] = [];
    for (const sign of [1, -1]) {
      const firstReal = new Float64Array(physicalVectorSize);
      const firstImaginary = new Float64Array(physicalVectorSize);
      const secondReal = new Float64Array(physicalVectorSize);
      const secondImaginary = new Float64Array(physicalVectorSize);
      for (let index = 0; index < physicalVectorSize; index += 1) {
        firstReal[index] = ritzBlockReal[index] - ritzBlockImaginary[physicalVectorSize + index];
        firstImaginary[index] = ritzBlockImaginary[index] + ritzBlockReal[physicalVectorSize + index];
        secondReal[index] = ritzBlockReal[index] + ritzBlockImaginary[physicalVectorSize + index];
        secondImaginary[index] = ritzBlockReal[physicalVectorSize + index] - ritzBlockImaginary[index];
      }
      const first = candidateFromVector(firstReal, firstImaginary, inverseReal, sign * inverseImaginary);
      const second = candidateFromVector(secondReal, secondImaginary, inverseReal, sign * inverseImaginary);
      if (first) alternatives.push(first);
      if (second) alternatives.push(second);
    }
    alternatives.sort((first, second) => first.residual - second.residual);
    if (alternatives[0]) candidates.push(alternatives[0]);
  }

  return finish(candidates);
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
  if (operator.solveShifted) return operator.solveShifted(shift, rightHandSide);
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

function buildReducedBendMode(pair: RitzPair, order: number, config: WaveguideConfig, operator: OperatorContext): WaveguideMode {
  if (!operator.reconstructTransverse) throw new Error("The reduced bend operator cannot reconstruct magnetic fields.");
  const beta = complexSquareRoot(pair.eigenvalue, pair.eigenvalueImaginary);
  const electricImaginary = pair.vectorImaginary ?? new Float64Array(pair.vector.length);
  const magnetic = operator.reconstructTransverse(pair.vector, electricImaginary, beta.real, beta.imaginary);
  const fullReal = new Float64Array(2 * pair.vector.length);
  const fullImaginary = new Float64Array(2 * pair.vector.length);
  fullReal.set(pair.vector);
  fullReal.set(magnetic.real, pair.vector.length);
  fullImaginary.set(electricImaginary);
  fullImaginary.set(magnetic.imaginary, pair.vector.length);
  return buildFirstOrderMode({
    eigenvalue: beta.real,
    eigenvalueImaginary: beta.imaginary,
    vector: fullReal,
    vectorImaginary: fullImaginary,
    residual: pair.residual,
  }, order, config, operator);
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
  const exAtNodes = complexAverage(ex, (part) => averageVerticalEdgesToNodes(part, nx, ny));
  const eyAtNodes = complexAverage(ey, (part) => averageHorizontalEdgesToNodes(part, nx, ny));
  const epsilonXZAtNodes = averageCellsToNodes(grid.epsilonCellXZ, nx, ny);
  const epsilonYZAtNodes = averageCellsToNodes(grid.epsilonCellYZ, nx, ny);
  const zeroTensorPart = new Float64Array(epsilonXZAtNodes.length);
  complexAddProductInPlace(longitudinalPotential, exAtNodes, epsilonXZAtNodes, zeroTensorPart, -1);
  complexAddProductInPlace(longitudinalPotential, eyAtNodes, epsilonYZAtNodes, zeroTensorPart, -1);
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
    electricCore += grid.coreFraction[index] * Math.abs(grid.epsilonCell[index]) * e2 * area;
  }
  let weightedElectricTotal = 0;
  for (let index = 0; index < electricIntensity.length; index += 1) {
    weightedElectricTotal += Math.abs(grid.epsilonCell[index]) * electricIntensity[index] * grid.cellArea[index];
  }

  const vacuumImpedanceOhm = 376.730313668;
  let powerForUnitMagneticFieldW = 0;
  for (let index = 0; index < rawPoynting.length; index += 1) {
    powerForUnitMagneticFieldW += vacuumImpedanceOhm * rawPoynting[index] * grid.cellArea[index] * 1e-12;
  }
  const hScale = Math.sqrt(NORMALIZED_MODAL_POWER_W / Math.max(Math.abs(powerForUnitMagneticFieldW), 1e-30));
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
  let electricLossIntegralVm2 = 0;
  let electricEnergyPerM = 0;
  let magneticEnergyPerM = 0;
  let coreStoredEnergyPerM = 0;
  let storedEnergySquaredIntegral = 0;
  let storedEnergyMagnitudePerM = 0;
  let pmlEnergyMagnitudePerM = 0;
  let boundaryEnergyMagnitudePerM = 0;
  const vacuumPermittivity = 8.854_187_8128e-12;
  const vacuumPermeability = 1.256_637_06212e-6;
  const pmlThickness = (config.boundary ?? "hard") === "pml" ? (config.pmlThicknessUm ?? config.paddingUm * 0.6) : 0;
  const pmlXStart = Math.max(Math.abs(grid.xNodes[0]), Math.abs(grid.xNodes[grid.xNodes.length - 1])) - pmlThickness;
  const pmlYStart = Math.max(Math.abs(grid.yNodes[0]), Math.abs(grid.yNodes[grid.yNodes.length - 1])) - pmlThickness;
  const regionLossIntegrals = new Map<string, number>();
  for (let index = 0; index < physicalIntensity.length; index += 1) {
    const ex2 = complexMagnitudeSquaredAt(physicalEx, index);
    const ey2 = complexMagnitudeSquaredAt(physicalEy, index);
    const ez2 = complexMagnitudeSquaredAt(physicalEz, index);
    physicalIntensity[index] = ex2 + ey2 + ez2;
    physicalPoynting[index] = 0.5 * (
      physicalEx.real[index] * physicalHy.real[index] + physicalEx.imaginary[index] * physicalHy.imaginary[index]
      - physicalEy.real[index] * physicalHx.real[index] - physicalEy.imaginary[index] * physicalHx.imaginary[index]
    );
    const cellPowerW = physicalPoynting[index] * grid.cellArea[index] * 1e-12;
    modalPowerW += cellPowerW;
    corePowerW += grid.coreFraction[index] * cellPowerW;
    const h2 = complexMagnitudeSquaredAt(physicalHx, index) + complexMagnitudeSquaredAt(physicalHy, index) + complexMagnitudeSquaredAt(physicalHz, index);
    let cellElectricEnergyDensity = 0;
    for (const region of grid.lossRegions) {
      if (region.fraction[index] <= 0) continue;
      const integral = region.fraction[index] * (
        region.epsilonImaginary.x * ex2
        + region.epsilonImaginary.y * ey2
        + region.epsilonImaginary.z * ez2
      ) * grid.cellArea[index] * 1e-12;
      electricLossIntegralVm2 += integral;
      regionLossIntegrals.set(region.region, (regionLossIntegrals.get(region.region) ?? 0) + integral);
      const regionElectricEnergyDensity = 0.25 * vacuumPermittivity * region.fraction[index]
        * complexTensorQuadratic(physicalEx, physicalEy, physicalEz, index, region.energyDerivative);
      cellElectricEnergyDensity += regionElectricEnergyDensity;
      if (region.region === "Core") coreStoredEnergyPerM += regionElectricEnergyDensity * grid.cellArea[index] * 1e-12;
    }
    const cellMagneticEnergyDensity = 0.25 * vacuumPermeability * h2;
    const cellStoredEnergyDensity = cellElectricEnergyDensity + cellMagneticEnergyDensity;
    const areaM2 = grid.cellArea[index] * 1e-12;
    electricEnergyPerM += cellElectricEnergyDensity * areaM2;
    magneticEnergyPerM += cellMagneticEnergyDensity * areaM2;
    coreStoredEnergyPerM += grid.coreFraction[index] * cellMagneticEnergyDensity * areaM2;
    storedEnergySquaredIntegral += cellStoredEnergyDensity ** 2 * areaM2;
    const magnitude = Math.abs(cellStoredEnergyDensity) * areaM2;
    storedEnergyMagnitudePerM += magnitude;
    const row = Math.floor(index / nx);
    const column = index % nx;
    if (pmlThickness > 0 && ((!grid.periodicX && Math.abs(grid.x[column]) >= pmlXStart) || (!grid.periodicY && Math.abs(grid.y[row]) >= pmlYStart))) pmlEnergyMagnitudePerM += magnitude;
    if (row < 2 || row >= ny - 2 || column < 2 || column >= nx - 2) boundaryEnergyMagnitudePerM += magnitude;
  }
  const angularFrequency = 2 * Math.PI * 299_792_458 / (config.wavelengthUm * 1e-6);
  const absorbedPowerPerM = 0.5 * angularFrequency * vacuumPermittivity * Math.max(0, electricLossIntegralVm2);
  const absorptionBetaImaginaryPerUm = absorbedPowerPerM / (2 * Math.max(Math.abs(modalPowerW), 1e-30)) * 1e-6;
  const eigenBetaImaginaryPerUm = Math.abs(betaComplex.imaginary);
  const betaImaginaryPerUm = Math.max(eigenBetaImaginaryPerUm, absorptionBetaImaginaryPerUm);
  const radiationBetaImaginaryPerUm = Math.max(0, eigenBetaImaginaryPerUm - absorptionBetaImaginaryPerUm);
  const lossDbPerCm = (betaImaginary: number) => (20 / Math.log(10)) * betaImaginary * 10_000;
  const materialAbsorption = [...regionLossIntegrals.entries()]
    .map(([region, integral]) => ({
      region,
      powerPerM: 0.5 * angularFrequency * vacuumPermittivity * Math.max(0, integral),
      fraction: 0,
    }))
    .filter((entry) => entry.powerPerM > 1e-18);
  materialAbsorption.forEach((entry) => { entry.fraction = entry.powerPerM / Math.max(absorbedPowerPerM, 1e-30); });
  const physicalFields = { Ex: physicalEx, Ey: physicalEy, Ez: physicalEz, Hx: physicalHx, Hy: physicalHy, Hz: physicalHz } as const;
  const complexFields = Object.fromEntries(Object.entries(physicalFields).map(([name, field]) => [name, {
    real: toMatrix(field.real, nx, ny),
    imaginary: toMatrix(field.imaginary, nx, ny),
  }])) as Record<PhysicalFieldComponent, ComplexFieldMatrix>;
  const fields: Record<FieldComponent, number[][]> = {
    Ex: complexFields.Ex.real,
    Ey: complexFields.Ey.real,
    Ez: complexFields.Ez.real,
    Hx: complexFields.Hx.real,
    Hy: complexFields.Hy.real,
    Hz: complexFields.Hz.real,
    intensity: toMatrix(physicalIntensity, nx, ny),
    poynting: toMatrix(physicalPoynting, nx, ny),
  };
  const transverseElectricEnergy = exEnergy + eyEnergy;
  const polarization = exEnergy >= eyEnergy ? "quasi-TE" : "quasi-TM";
  const classification = classifyField(polarization === "quasi-TE" ? fields.Ex : fields.Ey);
  const label = `${polarization === "quasi-TE" ? "TE" : "TM"}${classification.horizontalOrder}${classification.verticalOrder}`;
  const { exteriorIndex, maximumIndex, plasmonic } = guidanceBounds(config);
  const effectiveIndex = beta / k0;
  const guidanceMargin = effectiveIndex - exteriorIndex;
  const electricConfinement = electricCore / weightedElectricTotal;
  const storedEnergyPerM = electricEnergyPerM + magneticEnergyPerM;
  const energyConfinement = coreStoredEnergyPerM / Math.max(storedEnergyPerM, 1e-30);
  const energyEffectiveAreaUm2 = storedEnergyPerM ** 2 / Math.max(storedEnergySquaredIntegral, 1e-30) * 1e12;
  const energyVelocityMPerS = Math.abs(modalPowerW) / Math.max(storedEnergyPerM, 1e-30);
  const energyGroupIndex = 299_792_458 / Math.max(energyVelocityMPerS, 1e-30);
  const maximumLossTangent = grid.lossRegions.filter((region) => region.fraction.some((fraction) => fraction > 0)).reduce((maximum, region) => Math.max(maximum,
    Math.abs(region.epsilonImaginary.x) / Math.max(Math.abs(region.epsilonReal.x), 1e-12),
    Math.abs(region.epsilonImaginary.y) / Math.max(Math.abs(region.epsilonReal.y), 1e-12),
    Math.abs(region.epsilonImaginary.z) / Math.max(Math.abs(region.epsilonReal.z), 1e-12)), 0);
  const energyMetricValidity = maximumLossTangent < 1e-8 ? "lossless" : maximumLossTangent < 0.1 ? "weak-loss" : "diagnostic";
  const pmlEnergyFraction = pmlEnergyMagnitudePerM / Math.max(storedEnergyMagnitudePerM, 1e-30);
  const boundaryEnergyFraction = boundaryEnergyMagnitudePerM / Math.max(storedEnergyMagnitudePerM, 1e-30);
  const physicalClass = pmlEnergyFraction >= 0.8 && (config.bendRadiusUm ?? 0) === 0 && !config.periodicX && !config.periodicY ? "pml"
    : plasmonic ? "plasmonic"
      : pmlEnergyFraction >= 0.05 && radiationBetaImaginaryPerUm > Math.max(1e-10, 0.1 * absorptionBetaImaginaryPerUm) ? "leaky" : "guided";

  const bendRadiusUm = config.bendRadiusUm ?? 0;
  return {
    id: `${label}-${order}`,
    label,
    order,
    ...classification,
    polarization,
    effectiveIndex,
    effectiveIndexImaginary: betaImaginaryPerUm / k0,
    propagationConstantPerUm: beta,
    residual: pair.residual,
    electricConfinement,
    corePowerFraction: corePowerW / modalPowerW,
    effectiveAreaUm2: electricTotal ** 2 / electricSquared,
    energyConfinement,
    energyEffectiveAreaUm2,
    electricEnergyPerM,
    magneticEnergyPerM,
    storedEnergyPerM,
    energyVelocityMPerS,
    energyGroupIndex,
    energyMetricValidity,
    maximumLossTangent,
    physicalClass,
    pmlEnergyFraction,
    boundaryEnergyFraction,
    longitudinalElectricFraction: ezEnergy / electricTotal,
    xPolarizedElectricFraction: exEnergy / transverseElectricEnergy,
    lossDbPerCm: lossDbPerCm(betaImaginaryPerUm),
    absorptionLossDbPerCm: lossDbPerCm(absorptionBetaImaginaryPerUm),
    radiationLossDbPerCm: lossDbPerCm(radiationBetaImaginaryPerUm),
    propagationLengthUm: betaImaginaryPerUm > 0 ? 1 / (2 * betaImaginaryPerUm) : Number.POSITIVE_INFINITY,
    lossBalanceRelativeDifference: Math.abs(eigenBetaImaginaryPerUm - absorptionBetaImaginaryPerUm)
      / Math.max(eigenBetaImaginaryPerUm, absorptionBetaImaginaryPerUm, 1e-30),
    absorbedPowerPerM,
    materialAbsorption,
    modalPowerW,
    peakPoyntingWPerM2: Math.max(...physicalPoynting),
    guidanceMargin,
    nearCutoff: plasmonic
      ? guidanceMargin < 1e-4
      : guidanceMargin < Math.max(1e-3, 0.01 * (maximumIndex - exteriorIndex)) || electricConfinement < 0.02,
    ...(bendRadiusUm > 0 ? {
      bendRadiusUm,
      azimuthalModeNumber: beta * bendRadiusUm,
    } : {}),
    fields,
    complexFields,
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

function expandBlochHx(values: ComplexArray, grid: Grid): ComplexArray {
  if (!grid.periodicX) return values;
  const output = { real: new Float64Array(grid.ny * (grid.nx + 1)), imaginary: new Float64Array(grid.ny * (grid.nx + 1)) };
  const cosine = Math.cos(grid.blochPhaseXRad);
  const sine = Math.sin(grid.blochPhaseXRad);
  for (let row = 0; row < grid.ny; row += 1) {
    const reducedOffset = row * grid.nx;
    const fullOffset = row * (grid.nx + 1);
    output.real.set(values.real.subarray(reducedOffset, reducedOffset + grid.nx), fullOffset);
    output.imaginary.set(values.imaginary.subarray(reducedOffset, reducedOffset + grid.nx), fullOffset);
    const real = values.real[reducedOffset];
    const imaginary = values.imaginary[reducedOffset];
    output.real[fullOffset + grid.nx] = cosine * real - sine * imaginary;
    output.imaginary[fullOffset + grid.nx] = sine * real + cosine * imaginary;
  }
  return output;
}

function expandBlochHy(values: ComplexArray, grid: Grid): ComplexArray {
  if (!grid.periodicY) return values;
  const output = { real: new Float64Array((grid.ny + 1) * grid.nx), imaginary: new Float64Array((grid.ny + 1) * grid.nx) };
  output.real.set(values.real);
  output.imaginary.set(values.imaginary);
  const cosine = Math.cos(grid.blochPhaseYRad);
  const sine = Math.sin(grid.blochPhaseYRad);
  for (let column = 0; column < grid.nx; column += 1) {
    const real = values.real[column];
    const imaginary = values.imaginary[column];
    const index = grid.ny * grid.nx + column;
    output.real[index] = cosine * real - sine * imaginary;
    output.imaginary[index] = sine * real + cosine * imaginary;
  }
  return output;
}

function restrictBlochHx(values: ComplexArray, grid: Grid): ComplexArray {
  if (!grid.periodicX) return values;
  const output = { real: new Float64Array(grid.nx * grid.ny), imaginary: new Float64Array(grid.nx * grid.ny) };
  for (let row = 0; row < grid.ny; row += 1) {
    output.real.set(values.real.subarray(row * (grid.nx + 1), row * (grid.nx + 1) + grid.nx), row * grid.nx);
    output.imaginary.set(values.imaginary.subarray(row * (grid.nx + 1), row * (grid.nx + 1) + grid.nx), row * grid.nx);
  }
  return output;
}

function restrictBlochHy(values: ComplexArray, grid: Grid): ComplexArray {
  if (!grid.periodicY) return values;
  return { real: values.real.slice(0, grid.nx * grid.ny), imaginary: values.imaginary.slice(0, grid.nx * grid.ny) };
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

function complexTensorQuadratic(
  ex: ComplexArray, ey: ComplexArray, ez: ComplexArray, index: number, tensor: SymmetricTensor,
): number {
  const inner = (first: ComplexArray, second: ComplexArray) => first.real[index] * second.real[index] + first.imaginary[index] * second.imaginary[index];
  return tensor.xx * complexMagnitudeSquaredAt(ex, index)
    + tensor.yy * complexMagnitudeSquaredAt(ey, index)
    + tensor.zz * complexMagnitudeSquaredAt(ez, index)
    + 2 * tensor.xy * inner(ex, ey)
    + 2 * tensor.xz * inner(ex, ez)
    + 2 * tensor.yz * inner(ey, ez);
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

function complexDerivative(
  values: ComplexArray,
  derivative: (part: Float64Array) => Float64Array,
  stretchReal: Float64Array,
  stretchImaginary: Float64Array,
  stretchIndex: (index: number) => number,
): ComplexArray {
  const output = { real: derivative(values.real), imaginary: derivative(values.imaginary) };
  applyComplexStretch(output, stretchReal, stretchImaginary, stretchIndex);
  return output;
}

function applyComplexStretch(
  output: ComplexArray,
  stretchReal: Float64Array,
  stretchImaginary: Float64Array,
  stretchIndex: (index: number) => number,
): void {
  for (let index = 0; index < output.real.length; index += 1) {
    const factor = stretchIndex(index);
    const nextReal = output.real[index] * stretchReal[factor] - output.imaginary[index] * stretchImaginary[factor];
    output.imaginary[index] = output.real[index] * stretchImaginary[factor] + output.imaginary[index] * stretchReal[factor];
    output.real[index] = nextReal;
  }
}

function complexPeriodicDifferenceX(values: ComplexArray, rows: number, grid: Grid): ComplexArray {
  const output = { real: new Float64Array(rows * (grid.nx + 1)), imaginary: new Float64Array(rows * (grid.nx + 1)) };
  const cosine = Math.cos(grid.blochPhaseXRad);
  const sine = Math.sin(grid.blochPhaseXRad);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column <= grid.nx; column += 1) {
      const outputIndex = row * (grid.nx + 1) + column;
      let westReal = 0; let westImaginary = 0; let eastReal = 0; let eastImaginary = 0;
      if (column > 0) {
        westReal = values.real[row * grid.nx + column - 1];
        westImaginary = values.imaginary[row * grid.nx + column - 1];
      } else {
        const index = row * grid.nx + grid.nx - 1;
        westReal = cosine * values.real[index] + sine * values.imaginary[index];
        westImaginary = cosine * values.imaginary[index] - sine * values.real[index];
      }
      if (column < grid.nx) {
        eastReal = values.real[row * grid.nx + column];
        eastImaginary = values.imaginary[row * grid.nx + column];
      } else {
        const index = row * grid.nx;
        eastReal = cosine * values.real[index] - sine * values.imaginary[index];
        eastImaginary = sine * values.real[index] + cosine * values.imaginary[index];
      }
      output.real[outputIndex] = (eastReal - westReal) / grid.dxDual[column];
      output.imaginary[outputIndex] = (eastImaginary - westImaginary) / grid.dxDual[column];
    }
  }
  applyComplexStretch(output, grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
  return output;
}

function complexPeriodicDifferenceY(values: ComplexArray, columns: number, grid: Grid): ComplexArray {
  const output = { real: new Float64Array((grid.ny + 1) * columns), imaginary: new Float64Array((grid.ny + 1) * columns) };
  const cosine = Math.cos(grid.blochPhaseYRad);
  const sine = Math.sin(grid.blochPhaseYRad);
  for (let row = 0; row <= grid.ny; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const outputIndex = row * columns + column;
      let southReal = 0; let southImaginary = 0; let northReal = 0; let northImaginary = 0;
      if (row > 0) {
        southReal = values.real[(row - 1) * columns + column];
        southImaginary = values.imaginary[(row - 1) * columns + column];
      } else {
        const index = (grid.ny - 1) * columns + column;
        southReal = cosine * values.real[index] + sine * values.imaginary[index];
        southImaginary = cosine * values.imaginary[index] - sine * values.real[index];
      }
      if (row < grid.ny) {
        northReal = values.real[row * columns + column];
        northImaginary = values.imaginary[row * columns + column];
      } else {
        const index = column;
        northReal = cosine * values.real[index] - sine * values.imaginary[index];
        northImaginary = sine * values.real[index] + cosine * values.imaginary[index];
      }
      output.real[outputIndex] = (northReal - southReal) / grid.dyDual[row];
      output.imaginary[outputIndex] = (northImaginary - southImaginary) / grid.dyDual[row];
    }
  }
  applyComplexStretch(output, grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, (index) => Math.floor(index / columns));
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
  if (grid.periodicX) return complexPeriodicDifferenceX(values, grid.ny, grid);
  return complexDerivative(values, (part) => cx(part, grid.nx, grid.ny, grid.dxDual), grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
}

function complexCy(values: ComplexArray, grid: Grid): ComplexArray {
  if (grid.periodicY) return complexPeriodicDifferenceY(values, grid.nx, grid);
  return complexDerivative(values, (part) => cy(part, grid.nx, grid.ny, grid.dyDual), grid.inverseStretchYNodeReal, grid.inverseStretchYNodeImaginary, (index) => Math.floor(index / grid.nx));
}

function complexDxOperator(values: ComplexArray, grid: Grid): ComplexArray {
  if (grid.periodicX) return complexPeriodicDifferenceX(values, grid.ny + 1, grid);
  return complexDerivative(values, (part) => dxOperator(part, grid.nx, grid.ny, grid.dxDual), grid.inverseStretchXNodeReal, grid.inverseStretchXNodeImaginary, (index) => index % (grid.nx + 1));
}

function complexDyOperator(values: ComplexArray, grid: Grid): ComplexArray {
  if (grid.periodicY) return complexPeriodicDifferenceY(values, grid.nx + 1, grid);
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

function averageVerticalEdgesToNodes(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array((nx + 1) * (ny + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const west = values[row * nx + clamp(column - 1, 0, nx - 1)];
      const east = values[row * nx + clamp(column, 0, nx - 1)];
      output[row * (nx + 1) + column] = (west + east) / 2;
    }
  }
  return output;
}

function averageHorizontalEdgesToNodes(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array((nx + 1) * (ny + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = values[clamp(row - 1, 0, ny - 1) * (nx + 1) + column];
      const north = values[clamp(row, 0, ny - 1) * (nx + 1) + column];
      output[row * (nx + 1) + column] = (south + north) / 2;
    }
  }
  return output;
}

function averageCellsToNodes(values: Float64Array, nx: number, ny: number): Float64Array {
  const output = new Float64Array((nx + 1) * (ny + 1));
  for (let row = 0; row <= ny; row += 1) {
    for (let column = 0; column <= nx; column += 1) {
      const south = clamp(row - 1, 0, ny - 1);
      const north = clamp(row, 0, ny - 1);
      const west = clamp(column - 1, 0, nx - 1);
      const east = clamp(column, 0, nx - 1);
      output[row * (nx + 1) + column] = (
        values[cellIndex(south, west, nx)] + values[cellIndex(south, east, nx)]
        + values[cellIndex(north, west, nx)] + values[cellIndex(north, east, nx)]
      ) / 4;
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
