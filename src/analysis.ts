import {
  PARAMETER_MAXIMUMS,
  resampledModeOverlap,
  solveWaveguide,
  validateWaveguide,
  type GeometrySweepParameter,
  type SolverResult,
  type WaveguideConfig,
  type WaveguideMode,
} from "./solver";

export interface GaussianCouplingSettings {
  waistUm: number;
  offsetXUm: number;
  offsetYUm: number;
  polarizationAngleDeg: number;
}

export interface GaussianCouplingResult {
  efficiency: number;
  couplingLossDb: number;
  waistUm: number;
}

export interface DirectionalCouplerSettings {
  gapUm: number;
  polarization: "quasi-TE" | "quasi-TM";
}

export interface DirectionalCouplerResult {
  evenEffectiveIndex: number;
  oddEffectiveIndex: number;
  indexSplitting: number;
  couplingCoefficientPerUm: number;
  couplingLengthUm: number;
  evenParity: number;
  oddParity: number;
}

export interface WaveguideComparisonResult {
  sourceLabels: string[];
  targetLabels: string[];
  powerOverlap: number[][];
  effectiveIndexMismatch: number[][];
  wavelengthUm: number;
}

export interface ToleranceSettings {
  widthStdDevNm: number;
  heightStdDevNm: number;
  gapStdDevNm: number;
  coreIndexStdDev: number;
  samples: number;
  seed: number;
  modeIndex: number;
}

export interface ToleranceSample {
  widthUm: number;
  heightUm: number;
  gapUm: number;
  coreIndexOffset: number;
  effectiveIndex: number;
  electricConfinement: number;
  effectiveAreaUm2: number;
  lossDbPerCm: number;
  overlap: number;
}

export interface DistributionSummary {
  mean: number;
  standardDeviation: number;
  p05: number;
  p95: number;
}

export interface ToleranceResult {
  samples: ToleranceSample[];
  failedSamples: number;
  effectiveIndex: DistributionSummary;
  electricConfinement: DistributionSummary;
  effectiveAreaUm2: DistributionSummary;
  lossDbPerCm: DistributionSummary;
  effectiveIndexSensitivity: Array<{ parameter: string; correlation: number }>;
}

export type ModeMapParameter = GeometrySweepParameter;

export interface ModeMapSettings {
  parameter: ModeMapParameter;
  startValueUm: number;
  stopValueUm: number;
  geometryPoints: number;
  startWavelengthUm: number;
  stopWavelengthUm: number;
  wavelengthPoints: number;
  maximumModes: number;
  gridResolution: number;
  modeIndex: number;
}

export interface ModeMapResult {
  parameter: ModeMapParameter;
  valuesUm: number[];
  wavelengthsUm: number[];
  modeCount: number[][];
  effectiveIndex: number[][];
  warnings: string[];
}

export function analyzeGaussianCoupling(
  result: SolverResult,
  modeIndex: number,
  settings: GaussianCouplingSettings,
): GaussianCouplingResult {
  if (!(settings.waistUm > 0 && Number.isFinite(settings.waistUm))) throw new Error("Gaussian waist must be positive.");
  const mode = result.modes[modeIndex];
  if (!mode) throw new Error("The selected mode is unavailable.");
  const angle = settings.polarizationAngleDeg * Math.PI / 180;
  const polarizationX = Math.cos(angle);
  const polarizationY = Math.sin(angle);
  let numerator = 0;
  let modeNorm = 0;
  let gaussianNorm = 0;
  for (let row = 0; row < result.yUm.length; row += 1) {
    const dy = localSpacing(result.yUm, row);
    for (let column = 0; column < result.xUm.length; column += 1) {
      const dx = localSpacing(result.xUm, column);
      const area = dx * dy;
      const radiusSquared = (result.xUm[column] - settings.offsetXUm) ** 2 + (result.yUm[row] - settings.offsetYUm) ** 2;
      const gaussian = Math.exp(-radiusSquared / settings.waistUm ** 2);
      const projectedMode = mode.fields.Ex[row][column] * polarizationX + mode.fields.Ey[row][column] * polarizationY;
      numerator += projectedMode * gaussian * area;
      modeNorm += (mode.fields.Ex[row][column] ** 2 + mode.fields.Ey[row][column] ** 2) * area;
      gaussianNorm += gaussian ** 2 * area;
    }
  }
  const efficiency = Math.min(1, numerator ** 2 / Math.max(modeNorm * gaussianNorm, 1e-30));
  return { efficiency, couplingLossDb: -10 * Math.log10(Math.max(efficiency, 1e-15)), waistUm: settings.waistUm };
}

export function analyzeDirectionalCoupler(config: WaveguideConfig, settings: DirectionalCouplerSettings): DirectionalCouplerResult {
  if (!(settings.gapUm > 0 && settings.gapUm <= PARAMETER_MAXIMUMS.dimensionUm)) throw new Error("Coupler gap must be positive.");
  const result = solveWaveguide({ ...config, geometry: "coupler", couplerGapUm: settings.gapUm, modeCount: Math.max(4, config.modeCount) });
  const candidates = result.modes.filter((mode) => mode.polarization === settings.polarization)
    .map((mode) => ({ mode, parity: horizontalParity(mode) }));
  const even = candidates.filter((candidate) => candidate.parity >= 0).sort(byEffectiveIndex)[0];
  const odd = candidates.filter((candidate) => candidate.parity < 0).sort(byEffectiveIndex)[0];
  if (!even || !odd) throw new Error(`Two ${settings.polarization} supermodes were not found; refine the grid or request more modes.`);
  const indexSplitting = Math.abs(even.mode.effectiveIndex - odd.mode.effectiveIndex);
  const propagationSplitting = 2 * Math.PI * indexSplitting / config.wavelengthUm;
  return {
    evenEffectiveIndex: even.mode.effectiveIndex,
    oddEffectiveIndex: odd.mode.effectiveIndex,
    indexSplitting,
    couplingCoefficientPerUm: propagationSplitting / 2,
    couplingLengthUm: Math.PI / Math.max(propagationSplitting, 1e-30),
    evenParity: even.parity,
    oddParity: odd.parity,
  };
}

export function compareWaveguides(sourceConfig: WaveguideConfig, targetConfig: WaveguideConfig, maximumModes = 3): WaveguideComparisonResult {
  if (!Number.isInteger(maximumModes) || maximumModes < 1 || maximumModes > 4) throw new Error("Comparison modes must be an integer between 1 and 4.");
  const sourceResult = solveWaveguide({ ...sourceConfig, modeCount: maximumModes });
  const targetResult = solveWaveguide({ ...targetConfig, wavelengthUm: sourceConfig.wavelengthUm, modeCount: maximumModes });
  if (sourceResult.modes.length === 0 || targetResult.modes.length === 0) throw new Error("Both cross-sections need at least one guided mode.");
  return {
    sourceLabels: sourceResult.modes.map((mode) => mode.label),
    targetLabels: targetResult.modes.map((mode) => mode.label),
    powerOverlap: sourceResult.modes.map((sourceMode) => targetResult.modes.map((targetMode) => (
      resampledModeOverlap(sourceResult, sourceMode, targetResult, targetMode) ** 2
    ))),
    effectiveIndexMismatch: sourceResult.modes.map((sourceMode) => targetResult.modes.map((targetMode) => (
      Math.abs(sourceMode.effectiveIndex - targetMode.effectiveIndex)
    ))),
    wavelengthUm: sourceConfig.wavelengthUm,
  };
}

export function analyzeTolerances(config: WaveguideConfig, settings: ToleranceSettings): ToleranceResult {
  if (!Number.isInteger(settings.samples) || settings.samples < 6 || settings.samples > 100) throw new Error("Tolerance samples must be an integer between 6 and 100.");
  if (!Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > 2_147_483_647) throw new Error("Seed must be a non-negative 32-bit integer.");
  const deviations = [settings.widthStdDevNm, settings.heightStdDevNm, settings.gapStdDevNm, settings.coreIndexStdDev];
  if (deviations.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Tolerance standard deviations must be finite and non-negative.");
  const nominalResult = solveWaveguide({ ...config, modeCount: Math.max(config.modeCount, settings.modeIndex + 2) });
  const nominalMode = nominalResult.modes[settings.modeIndex];
  if (!nominalMode) throw new Error("The selected nominal mode is unavailable.");
  const random = seededRandom(settings.seed);
  const dimensions = latinGaussianSamples(settings.samples, 4, random);
  const samples: ToleranceSample[] = [];
  let failedSamples = 0;
  for (let index = 0; index < settings.samples; index += 1) {
    const widthUm = config.widthUm + dimensions[0][index] * settings.widthStdDevNm / 1_000;
    const heightUm = config.heightUm + dimensions[1][index] * settings.heightStdDevNm / 1_000;
    const nominalGap = (config.geometry ?? "channel") === "coupler" ? (config.couplerGapUm ?? 0) : (config.slotGapUm ?? 0);
    const gapUm = nominalGap + dimensions[2][index] * settings.gapStdDevNm / 1_000;
    const coreIndexOffset = dimensions[3][index] * settings.coreIndexStdDev;
    const sampledConfig: WaveguideConfig = {
      ...config, widthUm, heightUm, coreIndexOffset,
      coreIndex: config.coreIndex,
      modeCount: Math.max(config.modeCount, settings.modeIndex + 2),
      ...((config.geometry ?? "channel") === "slot" ? { slotGapUm: gapUm } : {}),
      ...((config.geometry ?? "channel") === "coupler" ? { couplerGapUm: gapUm } : {}),
    };
    if (validateWaveguide(sampledConfig).length > 0) { failedSamples += 1; continue; }
    try {
      const sampledResult = solveWaveguide(sampledConfig);
      const ranked = sampledResult.modes.map((mode) => ({ mode, overlap: resampledModeOverlap(nominalResult, nominalMode, sampledResult, mode) }))
        .sort((first, second) => second.overlap - first.overlap);
      const tracked = ranked[0];
      if (!tracked) { failedSamples += 1; continue; }
      samples.push({ widthUm, heightUm, gapUm, coreIndexOffset, effectiveIndex: tracked.mode.effectiveIndex,
        electricConfinement: tracked.mode.electricConfinement, effectiveAreaUm2: tracked.mode.effectiveAreaUm2,
        lossDbPerCm: tracked.mode.lossDbPerCm, overlap: tracked.overlap });
    } catch { failedSamples += 1; }
  }
  if (samples.length < 5) throw new Error("Fewer than five valid tolerance samples converged.");
  return {
    samples, failedSamples,
    effectiveIndex: summarize(samples.map((sample) => sample.effectiveIndex)),
    electricConfinement: summarize(samples.map((sample) => sample.electricConfinement)),
    effectiveAreaUm2: summarize(samples.map((sample) => sample.effectiveAreaUm2)),
    lossDbPerCm: summarize(samples.map((sample) => sample.lossDbPerCm)),
    // ponytail: Pearson screening is first-order; add Sobol indices when nonlinear interactions become a measured limitation.
    effectiveIndexSensitivity: [
      { parameter: "Width", values: samples.map((sample) => sample.widthUm) },
      { parameter: "Height", values: samples.map((sample) => sample.heightUm) },
      ...(settings.gapStdDevNm > 0 ? [{ parameter: "Gap", values: samples.map((sample) => sample.gapUm) }] : []),
      { parameter: "Core index", values: samples.map((sample) => sample.coreIndexOffset) },
    ].map((entry) => ({ parameter: entry.parameter, correlation: correlation(entry.values, samples.map((sample) => sample.effectiveIndex)) }))
      .filter((entry) => Number.isFinite(entry.correlation))
      .sort((first, second) => Math.abs(second.correlation) - Math.abs(first.correlation)),
  };
}

export function calculateModeMap(config: WaveguideConfig, settings: ModeMapSettings): ModeMapResult {
  if (!(settings.startValueUm > 0 && settings.stopValueUm > settings.startValueUm)) throw new Error("Geometry-map limits must be positive and ordered.");
  if (!(settings.startWavelengthUm >= 0.2 && settings.stopWavelengthUm > settings.startWavelengthUm && settings.stopWavelengthUm <= PARAMETER_MAXIMUMS.wavelengthUm)) throw new Error("Wavelength-map limits are invalid.");
  if (![settings.geometryPoints, settings.wavelengthPoints].every((value) => Number.isInteger(value) && value >= 3 && value <= 15)) throw new Error("Each map axis must contain between 3 and 15 points.");
  if (settings.geometryPoints * settings.wavelengthPoints > 100) throw new Error("Mode maps are limited to 100 solves.");
  if (!Number.isInteger(settings.maximumModes) || settings.maximumModes < 1 || settings.maximumModes > PARAMETER_MAXIMUMS.modeCount) throw new Error("Maximum modes is invalid.");
  if (!Number.isInteger(settings.gridResolution) || settings.gridResolution < 24 || settings.gridResolution > 64) throw new Error("Map resolution must be between 24 and 64 cells.");
  const valuesUm = linearSpace(settings.startValueUm, settings.stopValueUm, settings.geometryPoints);
  const wavelengthsUm = linearSpace(settings.startWavelengthUm, settings.stopWavelengthUm, settings.wavelengthPoints);
  const modeCount: number[][] = [];
  const effectiveIndex: number[][] = [];
  let clipped = false;
  for (const wavelengthUm of wavelengthsUm) {
    const countRow: number[] = [];
    const indexRow: number[] = [];
    for (const valueUm of valuesUm) {
      const pointConfig = { ...config, wavelengthUm, gridResolution: settings.gridResolution, modeCount: settings.maximumModes, [settings.parameter]: valueUm };
      if (validateWaveguide(pointConfig).length > 0) { countRow.push(0); indexRow.push(Number.NaN); continue; }
      try {
        const result = solveWaveguide(pointConfig);
        countRow.push(result.modes.length);
        indexRow.push(result.modes[settings.modeIndex]?.effectiveIndex ?? Number.NaN);
        if (result.modes.length === settings.maximumModes) clipped = true;
      } catch { countRow.push(0); indexRow.push(Number.NaN); }
    }
    modeCount.push(countRow);
    effectiveIndex.push(indexRow);
  }
  const warnings = clipped ? ["At least one cell reached the requested mode limit; increase Maximum modes to rule out clipping."] : [];
  return { parameter: settings.parameter, valuesUm, wavelengthsUm, modeCount, effectiveIndex, warnings };
}

function horizontalParity(mode: WaveguideMode): number {
  const field = mode.polarization === "quasi-TE" ? mode.fields.Ex : mode.fields.Ey;
  let numerator = 0;
  let denominator = 0;
  for (const row of field) {
    for (let column = 0; column < row.length; column += 1) {
      numerator += row[column] * row[row.length - 1 - column];
      denominator += row[column] ** 2;
    }
  }
  return numerator / Math.max(denominator, 1e-30);
}

function byEffectiveIndex(first: { mode: WaveguideMode }, second: { mode: WaveguideMode }): number {
  return second.mode.effectiveIndex - first.mode.effectiveIndex;
}

function localSpacing(coordinates: number[], index: number): number {
  if (index === 0) return coordinates[1] - coordinates[0];
  if (index === coordinates.length - 1) return coordinates[index] - coordinates[index - 1];
  return (coordinates[index + 1] - coordinates[index - 1]) / 2;
}

function linearSpace(start: number, stop: number, points: number): number[] {
  return Array.from({ length: points }, (_, index) => start + index * (stop - start) / (points - 1));
}

function summarize(values: number[]): DistributionSummary {
  const sorted = [...values].sort((first, second) => first - second);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length - 1, 1);
  return { mean, standardDeviation: Math.sqrt(variance), p05: quantile(sorted, 0.05), p95: quantile(sorted, 0.95) };
}

function correlation(first: number[], second: number[]): number {
  const firstMean = first.reduce((sum, value) => sum + value, 0) / first.length;
  const secondMean = second.reduce((sum, value) => sum + value, 0) / second.length;
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstOffset = first[index] - firstMean;
    const secondOffset = second[index] - secondMean;
    covariance += firstOffset * secondOffset;
    firstVariance += firstOffset ** 2;
    secondVariance += secondOffset ** 2;
  }
  return covariance / Math.sqrt(firstVariance * secondVariance);
}

function quantile(sorted: number[], probability: number): number {
  const index = probability * (sorted.length - 1);
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[Math.min(lower + 1, sorted.length - 1)] * fraction;
}

function latinGaussianSamples(samples: number, dimensions: number, random: () => number): number[][] {
  return Array.from({ length: dimensions }, () => {
    const strata = Array.from({ length: samples }, (_, index) => index);
    for (let index = samples - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [strata[index], strata[swap]] = [strata[swap], strata[index]];
    }
    return strata.map((stratum) => inverseNormal((stratum + random()) / samples));
  });
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function inverseNormal(probability: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const low = 0.02425;
  const high = 1 - low;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability > high) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = probability - 0.5;
  const ratio = q ** 2;
  return (((((a[0] * ratio + a[1]) * ratio + a[2]) * ratio + a[3]) * ratio + a[4]) * ratio + a[5]) * q
    / (((((b[0] * ratio + b[1]) * ratio + b[2]) * ratio + b[3]) * ratio + b[4]) * ratio + 1);
}
