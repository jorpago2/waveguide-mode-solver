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

export interface ConvergenceSettings {
  coarseResolution: number;
  refinementRatio: number;
  modeIndex: number;
  includePmlSensitivity: boolean;
  lossTolerancePercent: number;
}

export interface ConvergenceLevel {
  name: "Coarse" | "Medium" | "Fine";
  resolution: number;
  spacingUm: number;
  effectiveIndex: number;
  lossDbPerCm: number;
  residual: number;
  overlap: number;
  modeLabel: string;
}

export interface PmlSensitivityPoint {
  name: string;
  resolution: number;
  paddingUm: number;
  thicknessUm: number;
  strength: number;
  effectiveIndex?: number;
  lossDbPerCm?: number;
  overlap?: number;
  lossChangePercent?: number;
  error?: string;
}

export interface PmlSensitivityResult {
  points: PmlSensitivityPoint[];
  maximumEffectiveIndexChangePercent?: number;
  maximumLossChangePercent?: number;
  minimumOverlap?: number;
  stable: boolean;
  tolerancePercent: number;
  failedChecks: number;
  gridLimited: boolean;
}

export interface ConvergenceResult {
  levels: ConvergenceLevel[];
  monotonic: boolean;
  observedOrder?: number;
  richardsonEffectiveIndex?: number;
  gciFinePercent?: number;
  asymptoticRatio?: number;
  inAsymptoticRange: boolean;
  fineRelativeChangePercent: number;
  lossRelativeSpreadPercent: number;
  lossFineChangePercent: number;
  lossValidation: "pass" | "review" | "mesh-only" | "not-applicable";
  pmlSensitivity?: PmlSensitivityResult;
  warnings: string[];
}

export interface ToleranceSettings {
  widthStdDevNm: number;
  heightStdDevNm: number;
  gapStdDevNm: number;
  sidewallAngleStdDevDeg: number;
  coreIndexStdDev: number;
  samples: number;
  seed: number;
  modeIndex: number;
}

export interface ToleranceSample {
  widthUm: number;
  heightUm: number;
  gapUm: number;
  sidewallAngleDeg: number;
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

export function analyzeConvergence(config: WaveguideConfig, settings: ConvergenceSettings): ConvergenceResult {
  if (!Number.isInteger(settings.coarseResolution) || settings.coarseResolution < 24) {
    throw new Error("Coarse resolution must be an integer of at least 24 cells.");
  }
  if (!Number.isFinite(settings.refinementRatio) || settings.refinementRatio < 1.3 || settings.refinementRatio > 2) {
    throw new Error("The refinement ratio must be between 1.3 and 2.0.");
  }
  if (!Number.isFinite(settings.lossTolerancePercent) || settings.lossTolerancePercent < 0.1 || settings.lossTolerancePercent > 100) {
    throw new Error("The loss tolerance must be between 0.1% and 100%.");
  }
  if (!Number.isInteger(settings.modeIndex) || settings.modeIndex < 0 || settings.modeIndex >= PARAMETER_MAXIMUMS.modeCount) {
    throw new Error("The selected convergence mode is invalid.");
  }
  const resolutions = [
    settings.coarseResolution,
    Math.round(settings.coarseResolution * settings.refinementRatio),
    Math.round(settings.coarseResolution * settings.refinementRatio ** 2),
  ];
  if (resolutions[2] > PARAMETER_MAXIMUMS.gridResolution) {
    throw new Error(`The finest grid exceeds ${PARAMETER_MAXIMUMS.gridResolution} cells; reduce the coarse resolution or refinement ratio.`);
  }
  if (new Set(resolutions).size !== 3) throw new Error("The refinement settings must produce three distinct grids.");

  const modeCount = Math.max(config.modeCount, settings.modeIndex + 2);
  const solved = resolutions.map((gridResolution) => solveWaveguide({ ...config, gridResolution, modeCount }));
  const tracked: WaveguideMode[] = [];
  const first = solved[0].modes[settings.modeIndex];
  if (!first) throw new Error("The selected mode was not found on the coarse grid.");
  tracked.push(first);
  for (let index = 1; index < solved.length; index += 1) {
    const candidates = solved[index].modes.map((mode) => ({
      mode,
      overlap: resampledModeOverlap(solved[index - 1], tracked[index - 1], solved[index], mode),
    })).sort((left, right) => right.overlap - left.overlap);
    if (!candidates[0]) throw new Error(`The selected mode was not found on the ${index === 1 ? "medium" : "fine"} grid.`);
    tracked.push(candidates[0].mode);
  }

  const levels = solved.map((result, index): ConvergenceLevel => ({
    name: (["Coarse", "Medium", "Fine"] as const)[index],
    resolution: resolutions[index],
    spacingUm: Math.sqrt(result.dxUm * result.dyUm),
    effectiveIndex: tracked[index].effectiveIndex,
    lossDbPerCm: tracked[index].lossDbPerCm,
    residual: tracked[index].residual,
    overlap: index === 0 ? 1 : resampledModeOverlap(solved[index - 1], tracked[index - 1], result, tracked[index]),
    modeLabel: tracked[index].label,
  }));
  const [coarse, medium, fine] = levels;
  const coarseDifference = coarse.effectiveIndex - medium.effectiveIndex;
  const fineDifference = medium.effectiveIndex - fine.effectiveIndex;
  const monotonic = coarseDifference * fineDifference > 0;
  const observedOrder = monotonic ? observedConvergenceOrder(fine, medium, coarse) : undefined;
  const fineRatio = medium.spacingUm / fine.spacingUm;
  const coarseRatio = coarse.spacingUm / medium.spacingUm;
  const denominator = observedOrder === undefined ? undefined : fineRatio ** observedOrder - 1;
  const richardsonEffectiveIndex = denominator && Math.abs(denominator) > 1e-12
    ? fine.effectiveIndex + (fine.effectiveIndex - medium.effectiveIndex) / denominator
    : undefined;
  const gciFinePercent = denominator && Math.abs(denominator) > 1e-12
    ? 125 * Math.abs((fine.effectiveIndex - medium.effectiveIndex) / fine.effectiveIndex) / Math.abs(denominator)
    : undefined;
  const coarseDenominator = observedOrder === undefined ? undefined : coarseRatio ** observedOrder - 1;
  const gciCoarsePercent = coarseDenominator && Math.abs(coarseDenominator) > 1e-12
    ? 125 * Math.abs((coarse.effectiveIndex - medium.effectiveIndex) / medium.effectiveIndex) / Math.abs(coarseDenominator)
    : undefined;
  const asymptoticRatio = observedOrder !== undefined && gciFinePercent && gciCoarsePercent
    ? gciCoarsePercent / (fineRatio ** observedOrder * gciFinePercent)
    : undefined;
  const inAsymptoticRange = observedOrder !== undefined && observedOrder >= 1.5 && observedOrder <= 2.5
    && asymptoticRatio !== undefined && Math.abs(asymptoticRatio - 1) <= 0.1;
  const lossValues = levels.map((level) => level.lossDbPerCm);
  const meanLoss = lossValues.reduce((sum, value) => sum + value, 0) / lossValues.length;
  const lossRelativeSpreadPercent = 100 * (Math.max(...lossValues) - Math.min(...lossValues)) / Math.max(Math.abs(meanLoss), 1e-30);
  const lossApplicable = Math.max(Math.abs(medium.lossDbPerCm), Math.abs(fine.lossDbPerCm)) > 1e-12;
  const lossFineChangePercent = lossApplicable
    ? 100 * Math.abs(fine.lossDbPerCm - medium.lossDbPerCm) / Math.max(Math.abs(fine.lossDbPerCm), 1e-30)
    : 0;
  const meshLossStable = lossApplicable && lossFineChangePercent <= settings.lossTolerancePercent;
  const warnings: string[] = [];
  if (!monotonic) warnings.push("Effective index converges non-monotonically; Richardson extrapolation and GCI are not applicable.");
  else if (observedOrder === undefined) warnings.push("An observed convergence order could not be fitted to these grids.");
  else if (observedOrder < 1.5 || observedOrder > 2.5) warnings.push("The observed order differs materially from the expected second-order trend; pre-asymptotic behavior or error cancellation is likely.");
  else if (!inAsymptoticRange) warnings.push("The three grids are not demonstrably in the asymptotic range; refine further before quoting the GCI.");
  if (Math.min(levels[1].overlap, levels[2].overlap) < 0.8) warnings.push("Modal overlap falls below 80% during refinement; inspect possible mode switching.");

  const pmlSensitivity = (config.boundary ?? "hard") === "pml" && settings.includePmlSensitivity
    ? analyzePmlSensitivity({ ...config, gridResolution: fine.resolution, modeCount }, solved[2], tracked[2], settings.lossTolerancePercent)
    : undefined;
  if (pmlSensitivity?.failedChecks) warnings.push(`${pmlSensitivity.failedChecks} PML robustness check${pmlSensitivity.failedChecks === 1 ? "" : "s"} failed to return the tracked mode.`);
  if (pmlSensitivity?.gridLimited) warnings.push("The boundary-distance check reached the 96-cell grid limit, so its mesh spacing is not held exactly constant.");
  if (lossApplicable && !meshLossStable) warnings.push(`Fine-grid loss changes by ${lossFineChangePercent.toPrecision(3)}%, above the ${settings.lossTolerancePercent}% tolerance.`);
  if (pmlSensitivity && !pmlSensitivity.stable) warnings.push(`Boundary or PML loss sensitivity exceeds the ${settings.lossTolerancePercent}% tolerance, mode overlap falls below 80%, or a check failed.`);
  const lossValidation = !lossApplicable ? "not-applicable"
    : pmlSensitivity ? (meshLossStable && pmlSensitivity.stable ? "pass" : "review")
      : meshLossStable ? "mesh-only" : "review";
  return {
    levels,
    monotonic,
    observedOrder,
    richardsonEffectiveIndex,
    gciFinePercent,
    asymptoticRatio,
    inAsymptoticRange,
    fineRelativeChangePercent: 100 * Math.abs(fine.effectiveIndex - medium.effectiveIndex) / Math.abs(fine.effectiveIndex),
    lossRelativeSpreadPercent,
    lossFineChangePercent,
    lossValidation,
    pmlSensitivity,
    warnings,
  };
}

export function analyzeTolerances(config: WaveguideConfig, settings: ToleranceSettings): ToleranceResult {
  if (!Number.isInteger(settings.samples) || settings.samples < 6 || settings.samples > 100) throw new Error("Tolerance samples must be an integer between 6 and 100.");
  if (!Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > 2_147_483_647) throw new Error("Seed must be a non-negative 32-bit integer.");
  const deviations = [settings.widthStdDevNm, settings.heightStdDevNm, settings.gapStdDevNm, settings.sidewallAngleStdDevDeg, settings.coreIndexStdDev];
  if (deviations.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Tolerance standard deviations must be finite and non-negative.");
  const nominalResult = solveWaveguide({ ...config, modeCount: Math.max(config.modeCount, settings.modeIndex + 2) });
  const nominalMode = nominalResult.modes[settings.modeIndex];
  if (!nominalMode) throw new Error("The selected nominal mode is unavailable.");
  const random = seededRandom(settings.seed);
  const dimensions = latinGaussianSamples(settings.samples, 5, random);
  const samples: ToleranceSample[] = [];
  let failedSamples = 0;
  for (let index = 0; index < settings.samples; index += 1) {
    const widthUm = config.widthUm + dimensions[0][index] * settings.widthStdDevNm / 1_000;
    const heightUm = config.heightUm + dimensions[1][index] * settings.heightStdDevNm / 1_000;
    const nominalGap = (config.geometry ?? "channel") === "coupler" ? (config.couplerGapUm ?? 0) : (config.slotGapUm ?? 0);
    const gapUm = nominalGap + dimensions[2][index] * settings.gapStdDevNm / 1_000;
    const sidewallAngleDeg = (config.sidewallAngleDeg ?? 90) + dimensions[3][index] * settings.sidewallAngleStdDevDeg;
    const coreIndexOffset = dimensions[4][index] * settings.coreIndexStdDev;
    const sampledConfig: WaveguideConfig = {
      ...config, widthUm, heightUm, sidewallAngleDeg, coreIndexOffset,
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
      samples.push({ widthUm, heightUm, gapUm, sidewallAngleDeg, coreIndexOffset, effectiveIndex: tracked.mode.effectiveIndex,
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
      ...(settings.sidewallAngleStdDevDeg > 0 ? [{ parameter: "Sidewall angle", values: samples.map((sample) => sample.sidewallAngleDeg) }] : []),
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

function observedConvergenceOrder(fine: ConvergenceLevel, medium: ConvergenceLevel, coarse: ConvergenceLevel): number | undefined {
  const target = Math.abs((coarse.effectiveIndex - medium.effectiveIndex) / (medium.effectiveIndex - fine.effectiveIndex));
  const ratioAt = (order: number) => Math.abs(
    (coarse.spacingUm ** order - medium.spacingUm ** order)
    / (medium.spacingUm ** order - fine.spacingUm ** order),
  );
  let lower = 0.05;
  let upper = 20;
  let lowerError = ratioAt(lower) - target;
  const upperError = ratioAt(upper) - target;
  if (!Number.isFinite(target) || lowerError * upperError > 0) return undefined;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointError = ratioAt(midpoint) - target;
    if (Math.abs(midpointError) < 1e-10) return midpoint;
    if (lowerError * midpointError <= 0) upper = midpoint;
    else { lower = midpoint; lowerError = midpointError; }
  }
  return (lower + upper) / 2;
}

function analyzePmlSensitivity(config: WaveguideConfig, baselineResult: SolverResult, baselineMode: WaveguideMode, tolerancePercent: number): PmlSensitivityResult {
  const thickness = config.pmlThicknessUm ?? config.paddingUm * 0.6;
  const strength = config.pmlStrength ?? 4;
  const boundaryPadding = Math.min(PARAMETER_MAXIMUMS.dimensionUm, config.paddingUm * 1.25);
  const requestedBoundaryResolution = Math.round(
    config.gridResolution * domainSpan(config, boundaryPadding) / domainSpan(config, config.paddingUm),
  );
  const boundaryResolution = Math.min(PARAMETER_MAXIMUMS.gridResolution, requestedBoundaryResolution);
  const variants: Array<{ name: string; config: WaveguideConfig }> = [
    { name: "Baseline", config },
    { name: "+25% boundary distance", config: { ...config, paddingUm: boundaryPadding, pmlThicknessUm: thickness, gridResolution: boundaryResolution } },
    { name: "+10% PML thickness", config: { ...config, pmlThicknessUm: Math.min(config.paddingUm * 0.9, thickness * 1.1) } },
    { name: "+25% PML strength", config: { ...config, pmlStrength: Math.min(50, strength * 1.25) } },
  ];
  const points = variants.map((variant, index): PmlSensitivityPoint => {
    const parameters = {
      name: variant.name,
      resolution: variant.config.gridResolution,
      paddingUm: variant.config.paddingUm,
      thicknessUm: variant.config.pmlThicknessUm ?? variant.config.paddingUm * 0.6,
      strength: variant.config.pmlStrength ?? 4,
    };
    try {
      const result = index === 0 ? baselineResult : solveWaveguide(variant.config);
      const mode = index === 0 ? baselineMode : result.modes.map((candidate) => ({
        candidate,
        overlap: resampledModeOverlap(baselineResult, baselineMode, result, candidate),
      })).sort((left, right) => right.overlap - left.overlap)[0]?.candidate;
      if (!mode) return { ...parameters, error: "Tracked mode not found" };
      return {
        ...parameters,
        effectiveIndex: mode.effectiveIndex,
        lossDbPerCm: mode.lossDbPerCm,
        overlap: index === 0 ? 1 : resampledModeOverlap(baselineResult, baselineMode, result, mode),
      };
    } catch (error) {
      return { ...parameters, error: error instanceof Error ? error.message : "Solver failed" };
    }
  });
  const baseline = points[0];
  const pointsWithChanges = points.map((point, index) => ({
    ...point,
    lossChangePercent: point.lossDbPerCm === undefined || baseline.lossDbPerCm === undefined ? undefined
      : index === 0 ? 0 : 100 * Math.abs(point.lossDbPerCm - baseline.lossDbPerCm) / Math.max(Math.abs(baseline.lossDbPerCm), 1e-30),
  }));
  const valid = pointsWithChanges.slice(1).filter((point) => point.effectiveIndex !== undefined && point.lossDbPerCm !== undefined);
  const effectiveIndexChanges = valid.map((point) => (
    100 * Math.abs(point.effectiveIndex! - baseline.effectiveIndex!) / Math.abs(baseline.effectiveIndex!)
  ));
  const lossChanges = valid.map((point) => (
    point.lossChangePercent as number
  ));
  const minimumOverlap = valid.length > 0 ? Math.min(...valid.map((point) => point.overlap ?? 0)) : undefined;
  const maximumLossChangePercent = lossChanges.length > 0 ? Math.max(...lossChanges) : undefined;
  const failedChecks = pointsWithChanges.filter((point) => point.error).length;
  return {
    points: pointsWithChanges,
    maximumEffectiveIndexChangePercent: effectiveIndexChanges.length > 0 ? Math.max(...effectiveIndexChanges) : undefined,
    maximumLossChangePercent,
    minimumOverlap,
    stable: failedChecks === 0 && maximumLossChangePercent !== undefined && maximumLossChangePercent <= tolerancePercent
      && minimumOverlap !== undefined && minimumOverlap >= 0.8,
    tolerancePercent,
    failedChecks,
    gridLimited: boundaryResolution < requestedBoundaryResolution,
  };
}

function domainSpan(config: WaveguideConfig, paddingUm: number): number {
  const geometry = config.geometry ?? "channel";
  const etchedHeight = geometry === "rib" ? config.heightUm - (config.slabHeightUm ?? config.heightUm / 2) : config.heightUm;
  const expansion = geometry === "slot" ? 0 : etchedHeight / Math.tan((config.sidewallAngleDeg ?? 90) * Math.PI / 180);
  const coreSpan = geometry === "coupler"
    ? 2 * config.widthUm + (config.couplerGapUm ?? config.widthUm / 2) + 2 * expansion
    : config.widthUm + 2 * expansion;
  return Math.max(coreSpan + 2 * paddingUm, config.heightUm + 2 * paddingUm);
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
