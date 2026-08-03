import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { runSolverWorker } from "./workerClient";
import { ConvergencePlot, ModeMapPlot, ModeTopologyPlot, TolerancePlot } from "./AnalysisPlots";
import type {
  ConvergenceResult, ConvergenceSettings, DirectionalCouplerResult, DirectionalCouplerSettings, GaussianCouplingResult, GaussianCouplingSettings,
  ModeMapParameter, ModeMapResult, ModeMapSettings, ToleranceResult, ToleranceSettings, WaveguideComparisonResult,
} from "./analysis";
import type { SolverResult, TopologySweepParameter, TopologySweepResult, TopologySweepSettings, WaveguideConfig } from "./solver";

interface Props {
  config: WaveguideConfig;
  result?: SolverResult;
  selectedMode: number;
  presets: Record<string, WaveguideConfig>;
}

const initialTolerance: ToleranceSettings = { widthStdDevNm: 10, heightStdDevNm: 5, gapStdDevNm: 5, sidewallAngleStdDevDeg: 0, coreIndexStdDev: 0.001, samples: 12, seed: 2026, modeIndex: 0 };
const initialConvergence: ConvergenceSettings = { coarseResolution: 24, refinementRatio: 1.4, modeIndex: 0, includePmlSensitivity: true, lossTolerancePercent: 10 };
const initialGaussian: GaussianCouplingSettings = { waistUm: 1.5, offsetXUm: 0, offsetYUm: 0, polarizationAngleDeg: 0 };
const initialCoupler: DirectionalCouplerSettings = { gapUm: 0.2, polarization: "quasi-TE" };
const initialMap: ModeMapSettings = { parameter: "widthUm", startValueUm: 0.5, stopValueUm: 1.5, geometryPoints: 5, startWavelengthUm: 1.45, stopWavelengthUm: 1.65, wavelengthPoints: 5, maximumModes: 4, gridResolution: 24, modeIndex: 0 };

export function AdvancedAnalyses({ config, result, selectedMode, presets }: Props) {
  const [active, setActive] = useState<string>();
  const [error, setError] = useState("");
  const [convergence, setConvergence] = useState(initialConvergence);
  const [convergenceResult, setConvergenceResult] = useState<ConvergenceResult>();
  const [tolerance, setTolerance] = useState(initialTolerance);
  const [toleranceResult, setToleranceResult] = useState<ToleranceResult>();
  const [gaussian, setGaussian] = useState(initialGaussian);
  const [gaussianResult, setGaussianResult] = useState<GaussianCouplingResult>();
  const [coupler, setCoupler] = useState(initialCoupler);
  const [couplerResult, setCouplerResult] = useState<DirectionalCouplerResult>();
  const [modeMap, setModeMap] = useState(initialMap);
  const [modeMapResult, setModeMapResult] = useState<ModeMapResult>();
  const [targetPreset, setTargetPreset] = useState(Object.keys(presets)[1] ?? Object.keys(presets)[0]);
  const [comparisonModes, setComparisonModes] = useState(3);
  const [comparisonResult, setComparisonResult] = useState<WaveguideComparisonResult>();
  const [topology, setTopology] = useState<TopologySweepSettings>(() => ({ parameter: "widthUm", startValue: 0.8 * config.widthUm, stopValue: 1.2 * config.widthUm, points: 7 }));
  const [topologyResult, setTopologyResult] = useState<TopologySweepResult>();

  useEffect(() => {
    if ((config.geometry ?? "channel") !== "polygon") return;
    setTopology((current) => current.parameter === "wavelengthUm" ? current : {
      parameter: "wavelengthUm", startValue: 0.8 * config.wavelengthUm, stopValue: 1.2 * config.wavelengthUm, points: current.points,
    });
  }, [config.geometry, config.wavelengthUm]);

  async function runConvergence(event: FormEvent) {
    event.preventDefault(); setActive("convergence"); setError("");
    try { setConvergenceResult(await runSolverWorker<ConvergenceResult>({ kind: "convergence", config, settings: { ...convergence, modeIndex: selectedMode } })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  async function runTolerance(event: FormEvent) {
    event.preventDefault(); setActive("tolerance"); setError("");
    try { setToleranceResult(await runSolverWorker<ToleranceResult>({ kind: "tolerances", config, settings: { ...tolerance, modeIndex: selectedMode } })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  async function runGaussian(event: FormEvent) {
    event.preventDefault(); if (!result) return; setActive("gaussian"); setError("");
    try { setGaussianResult(await runSolverWorker<GaussianCouplingResult>({ kind: "gaussianCoupling", result, modeIndex: selectedMode, settings: gaussian })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  async function runCoupler(event: FormEvent) {
    event.preventDefault(); setActive("coupler"); setError("");
    try { setCouplerResult(await runSolverWorker<DirectionalCouplerResult>({ kind: "directionalCoupler", config, settings: coupler })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  async function runModeMap(event: FormEvent) {
    event.preventDefault(); setActive("map"); setError("");
    try { setModeMapResult(await runSolverWorker<ModeMapResult>({ kind: "modeMap", config, settings: { ...modeMap, modeIndex: selectedMode } })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  async function runComparison(event: FormEvent) {
    event.preventDefault(); setActive("comparison"); setError("");
    try { setComparisonResult(await runSolverWorker<WaveguideComparisonResult>({ kind: "compareWaveguides", sourceConfig: config, targetConfig: presets[targetPreset], maximumModes: comparisonModes })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  async function runTopology(event: FormEvent) {
    event.preventDefault(); setActive("topology"); setError("");
    try { setTopologyResult(await runSolverWorker<TopologySweepResult>({ kind: "modeTopology", config, settings: topology })); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActive(undefined); }
  }

  function selectTopologyParameter(parameter: TopologySweepParameter) {
    const centre = parameter === "wavelengthUm" ? config.wavelengthUm : parameter === "coreExtinction" ? config.coreExtinction ?? 0.01
      : parameter === "slotGapUm" ? config.slotGapUm ?? config.widthUm / 5 : parameter === "couplerGapUm" ? config.couplerGapUm ?? config.widthUm / 2 : config[parameter];
    const span = parameter === "coreExtinction" ? Math.max(0.01, centre) : 0.2 * centre;
    setTopology({ parameter, startValue: Math.max(parameter === "wavelengthUm" ? 0.2 : parameter === "coreExtinction" ? 0 : 0.001, centre - span), stopValue: centre + span, points: topology.points });
  }

  const geometry = config.geometry ?? "channel";
  const gapAvailable = geometry === "slot" || geometry === "coupler";
  const selected = result?.modes[selectedMode];
  const maximumRightOverlap = result && result.modes.length > 1
    ? Math.max(0, ...(result.ritzNonOrthogonality[selectedMode] ?? []).filter((_, index) => index !== selectedMode)) : 0;
  return <>
    <section className="sweep-section" aria-labelledby="topology-title">
      <div className="panel-heading"><div><span className="step">T1</span><h2 id="topology-title">Non-Hermitian mode topology</h2></div>{topologyResult && <button type="button" className="export-button" onClick={() => exportTopology(topologyResult)}>Export CSV</button>}</div>
      <p className="section-intro">Inspect projected eigenvalue conditioning, right-mode non-orthogonality and complex-index trajectories. Interaction labels identify candidates that require a converged two-parameter loop before they can be called exceptional points.</p>
      {selected && <div className="analysis-metrics">
        <AnalysisMetric label="Projected condition κ" value={formatCondition(selected.eigenvalueConditionEstimate)} />
        <AnalysisMetric label="Projected Petermann K" value={formatCondition(selected.petermannFactorEstimate)} />
        <AnalysisMetric label="Largest right-mode overlap" value={maximumRightOverlap.toFixed(4)} />
        <AnalysisMetric label="Eigenpair residual" value={selected.residual.toExponential(2)} />
      </div>}
      {result && result.modes.length > 1 && <div className="comparison-scroll"><table className="comparison-table"><caption>Absolute overlaps between normalized right Ritz vectors</caption><thead><tr><th>Mode</th>{result.modes.map((mode) => <th key={mode.id}>{mode.label}</th>)}</tr></thead><tbody>{result.modes.map((mode, row) => <tr key={mode.id}><th>{mode.label}</th>{result.ritzNonOrthogonality[row].map((overlap, column) => <td key={result.modes[column].id}>{overlap.toFixed(4)}</td>)}</tr>)}</tbody></table></div>}
      <form className="analysis-controls" onSubmit={runTopology}>
        <label className="select-field">Sweep parameter<select value={topology.parameter} onChange={(event) => selectTopologyParameter(event.target.value as TopologySweepParameter)}>
          {geometry !== "polygon" && <><option value="widthUm">Core width</option><option value="heightUm">Core height</option></>}
          {geometry === "slot" && <option value="slotGapUm">Slot gap</option>}{geometry === "coupler" && <option value="couplerGapUm">Coupler gap</option>}
          <option value="wavelengthUm">Wavelength</option>{geometry !== "polygon" && <option value="coreExtinction">Core extinction</option>}
        </select></label>
        <AnalysisNumber label="Start" unit={topology.parameter === "coreExtinction" ? "κ" : "µm"} value={topology.startValue} min={topology.parameter === "wavelengthUm" ? 0.2 : 0} max={1_000} step={topology.parameter === "coreExtinction" ? 0.001 : 0.01} onChange={(value) => setTopology((current) => ({ ...current, startValue: value }))} />
        <AnalysisNumber label="Stop" unit={topology.parameter === "coreExtinction" ? "κ" : "µm"} value={topology.stopValue} min={topology.parameter === "wavelengthUm" ? 0.2 : 0} max={1_000} step={topology.parameter === "coreExtinction" ? 0.001 : 0.01} onChange={(value) => setTopology((current) => ({ ...current, stopValue: value }))} />
        <AnalysisNumber label="Points" unit="solves" value={topology.points} min={5} max={31} step={1} onChange={(value) => setTopology((current) => ({ ...current, points: value }))} />
        <button className="solve-button" type="submit" disabled={Boolean(active) || !result || config.modeCount < 2}>{active === "topology" ? "Tracking…" : "Analyze branches"}<span aria-hidden="true">→</span></button>
      </form>
      {config.modeCount < 2 && <p className="warning">Request at least two modes in the solver configuration before running topology analysis.</p>}
      {topologyResult && <><ModeTopologyPlot result={topologyResult} />{topologyResult.interactions.length > 0 && <div className="comparison-scroll"><table className="comparison-table"><caption>Local minima of the complex modal separation</caption><thead><tr><th>Parameter</th><th>Branches</th><th>Classification</th><th>|Δneff|</th><th>Right overlap</th><th>κproj</th></tr></thead><tbody>{topologyResult.interactions.map((interaction) => <tr key={`${interaction.value}-${interaction.branches.join("-")}`}><td>{interaction.value.toPrecision(5)}</td><td>{interaction.branches.map((branch) => branch + 1).join(" / ")}</td><td>{interaction.classification}</td><td>{interaction.complexIndexGap.toExponential(3)}</td><td>{interaction.rightModeOverlap.toFixed(4)}</td><td>{formatCondition(interaction.maximumConditionEstimate)}</td></tr>)}</tbody></table></div>}{topologyResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</>}
      <p className="limitation">K<sub>proj</sub> = κ<sub>proj</sub>² is obtained from left and right eigenvectors of the Arnoldi-projected operator. It is a convergence diagnostic, not yet the full Maxwell adjoint Petermann factor.</p>
    </section>
    <section className="sweep-section" aria-labelledby="convergence-title">
      <div className="panel-heading"><div><span className="step">05</span><h2 id="convergence-title">Numerical convergence</h2></div></div>
      <p className="section-intro">Track the selected mode over three systematically refined meshes. Loss is checked against the selected tolerance and, with PML, against boundary and absorber variations.</p>
      <form className="analysis-controls" onSubmit={runConvergence}>
        <AnalysisNumber label="Coarse resolution" unit="cells" value={convergence.coarseResolution} min={24} max={56} step={1} onChange={(value) => setConvergence((current) => ({ ...current, coarseResolution: value }))} />
        <AnalysisNumber label="Refinement ratio" unit="r" value={convergence.refinementRatio} min={1.3} max={2} step={0.05} onChange={(value) => setConvergence((current) => ({ ...current, refinementRatio: value }))} />
        <AnalysisNumber label="Loss tolerance" unit="%" value={convergence.lossTolerancePercent} min={0.1} max={100} step={0.5} onChange={(value) => setConvergence((current) => ({ ...current, lossTolerancePercent: value }))} />
        {(config.boundary ?? "hard") === "pml" && <label className="checkbox-field"><input type="checkbox" checked={convergence.includePmlSensitivity} onChange={(event) => setConvergence((current) => ({ ...current, includePmlSensitivity: event.target.checked }))} /><span>Test PML sensitivity</span></label>}
        <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "convergence" ? "Verifying…" : "Run convergence"}<span aria-hidden="true">→</span></button>
      </form>
      {convergenceResult && <>
        <div className="analysis-metrics">
          <AnalysisMetric label="Observed order" value={formatOptional(convergenceResult.observedOrder, 2)} />
          <AnalysisMetric label="Fine-grid change" value={`${convergenceResult.fineRelativeChangePercent.toPrecision(3)}%`} />
          <AnalysisMetric label="Fine-grid GCI" value={convergenceResult.gciFinePercent === undefined ? "—" : `${convergenceResult.gciFinePercent.toPrecision(3)}%`} />
          <AnalysisMetric label="Richardson neff" value={formatOptional(convergenceResult.richardsonEffectiveIndex, 7)} />
          <AnalysisMetric label="Asymptotic ratio" value={formatOptional(convergenceResult.asymptoticRatio, 3)} />
          <AnalysisMetric label="GCI status" value={convergenceResult.inAsymptoticRange ? "Asymptotic" : "Not verified"} />
          <AnalysisMetric label="Fine-grid loss change" value={`${convergenceResult.lossFineChangePercent.toPrecision(3)}%`} />
          <AnalysisMetric label="Loss validation" value={lossValidationLabel(convergenceResult.lossValidation)} />
        </div>
        <ConvergencePlot result={convergenceResult} />
        {convergenceResult.pmlSensitivity && <>
          <div className="analysis-metrics">
            <AnalysisMetric label="PML max Δneff" value={formatPercent(convergenceResult.pmlSensitivity.maximumEffectiveIndexChangePercent)} />
            <AnalysisMetric label="PML max loss change" value={formatPercent(convergenceResult.pmlSensitivity.maximumLossChangePercent)} />
            <AnalysisMetric label="Minimum mode overlap" value={convergenceResult.pmlSensitivity.minimumOverlap === undefined ? "—" : `${(100 * convergenceResult.pmlSensitivity.minimumOverlap).toFixed(2)}%`} />
            <AnalysisMetric label="PML loss status" value={convergenceResult.pmlSensitivity.stable ? "Pass" : "Review"} />
            <AnalysisMetric label="Failed PML checks" value={String(convergenceResult.pmlSensitivity.failedChecks)} />
          </div>
          <div className="comparison-scroll"><table className="comparison-table"><caption>One-at-a-time boundary and PML robustness checks on the finest mesh</caption><thead><tr><th>Variation</th><th>Grid</th><th>Padding</th><th>PML thickness</th><th>Strength</th><th>n<sub>eff</sub></th><th>Loss</th><th>Δloss</th><th>Overlap</th></tr></thead><tbody>{convergenceResult.pmlSensitivity.points.map((point) => <tr key={point.name}><th>{point.name}</th><td>{point.resolution}</td><td>{point.paddingUm.toFixed(3)} µm</td><td>{point.thicknessUm.toFixed(3)} µm</td><td>{point.strength.toFixed(2)}</td>{point.error ? <td colSpan={4} className="failed-check">{point.error}</td> : <><td>{point.effectiveIndex!.toFixed(7)}</td><td>{point.lossDbPerCm!.toPrecision(4)} dB/cm</td><td>{point.lossChangePercent!.toPrecision(3)}%</td><td>{(100 * point.overlap!).toFixed(2)}%</td></>}</tr>)}</tbody></table></div>
        </>}
        {convergenceResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      </>}
      <p className="limitation">GCI quantifies mesh discretization uncertainty in effective index. PML checks are sensitivity tests, not proof that the computed attenuation is a physical leakage rate.</p>
    </section>

    <section className="sweep-section" aria-labelledby="tolerance-title">
      <div className="panel-heading"><div><span className="step">06</span><h2 id="tolerance-title">Fabrication tolerances</h2></div></div>
      <p className="section-intro">Run a seeded Latin-hypercube Monte Carlo study. Inputs are independent Gaussian standard deviations.</p>
      <form className="analysis-controls" onSubmit={runTolerance}>
        <AnalysisNumber label="Width σ" unit="nm" value={tolerance.widthStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, widthStdDevNm: value }))} />
        <AnalysisNumber label="Height σ" unit="nm" value={tolerance.heightStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, heightStdDevNm: value }))} />
        {gapAvailable && <AnalysisNumber label="Gap σ" unit="nm" value={tolerance.gapStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, gapStdDevNm: value }))} />}
        <AnalysisNumber label="Sidewall-angle σ" unit="deg" value={tolerance.sidewallAngleStdDevDeg} min={0} max={20} step={0.1} onChange={(value) => setTolerance((current) => ({ ...current, sidewallAngleStdDevDeg: value }))} />
        <AnalysisNumber label="Core-index σ" unit="n" value={tolerance.coreIndexStdDev} min={0} max={1} step={0.0001} onChange={(value) => setTolerance((current) => ({ ...current, coreIndexStdDev: value }))} />
        <AnalysisNumber label="Samples" unit="runs" value={tolerance.samples} min={6} max={100} step={1} onChange={(value) => setTolerance((current) => ({ ...current, samples: value }))} />
        <AnalysisNumber label="Seed" unit="integer" value={tolerance.seed} min={0} max={2_147_483_647} step={1} onChange={(value) => setTolerance((current) => ({ ...current, seed: value }))} />
        <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "tolerance" ? "Sampling…" : "Run tolerances"}<span aria-hidden="true">→</span></button>
      </form>
      {toleranceResult && <><div className="analysis-metrics"><AnalysisMetric label="Mean neff" value={toleranceResult.effectiveIndex.mean.toFixed(6)} /><AnalysisMetric label="neff σ" value={toleranceResult.effectiveIndex.standardDeviation.toExponential(3)} /><AnalysisMetric label="90% interval" value={`${toleranceResult.effectiveIndex.p05.toFixed(5)}–${toleranceResult.effectiveIndex.p95.toFixed(5)}`} /><AnalysisMetric label="Strongest correlation" value={toleranceResult.effectiveIndexSensitivity[0] ? `${toleranceResult.effectiveIndexSensitivity[0].parameter} (${toleranceResult.effectiveIndexSensitivity[0].correlation.toFixed(2)})` : "—"} /><AnalysisMetric label="Valid samples" value={`${toleranceResult.samples.length}/${toleranceResult.samples.length + toleranceResult.failedSamples}`} /></div><TolerancePlot result={toleranceResult} /></>}
    </section>

    <section className="sweep-section" aria-labelledby="coupling-title">
      <div className="panel-heading"><div><span className="step">07</span><h2 id="coupling-title">Coupling analysis</h2></div></div>
      <div className="analysis-columns">
        <form className="analysis-card" onSubmit={runGaussian}>
          <h3>Gaussian-beam overlap</h3><p>Approximate butt-coupling overlap with a linearly polarized Gaussian field.</p>
          <div className="analysis-controls compact"><AnalysisNumber label="1/e field radius" unit="µm" value={gaussian.waistUm} min={0.05} max={100} step={0.05} onChange={(value) => setGaussian((current) => ({ ...current, waistUm: value }))} /><AnalysisNumber label="x offset" unit="µm" value={gaussian.offsetXUm} min={-100} max={100} step={0.05} onChange={(value) => setGaussian((current) => ({ ...current, offsetXUm: value }))} /><AnalysisNumber label="y offset" unit="µm" value={gaussian.offsetYUm} min={-100} max={100} step={0.05} onChange={(value) => setGaussian((current) => ({ ...current, offsetYUm: value }))} /><AnalysisNumber label="Polarization" unit="deg" value={gaussian.polarizationAngleDeg} min={-180} max={180} step={1} onChange={(value) => setGaussian((current) => ({ ...current, polarizationAngleDeg: value }))} /></div>
          <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "gaussian" ? "Calculating…" : "Calculate overlap"}<span aria-hidden="true">→</span></button>
          {gaussianResult && <div className="inline-result"><strong>{(100 * gaussianResult.efficiency).toFixed(2)}%</strong><span>{gaussianResult.couplingLossDb.toFixed(2)} dB coupling loss</span></div>}
        </form>
        <form className="analysis-card" onSubmit={runCoupler}>
          <h3>Directional coupler</h3><p>Solve even and odd supermodes of two identical guides and derive the full-transfer length.</p>
          <div className="analysis-controls compact"><AnalysisNumber label="Guide gap" unit="µm" value={coupler.gapUm} min={0.01} max={100} step={0.01} onChange={(value) => setCoupler((current) => ({ ...current, gapUm: value }))} /><label className="select-field">Polarization<select value={coupler.polarization} onChange={(event) => setCoupler((current) => ({ ...current, polarization: event.target.value as DirectionalCouplerSettings["polarization"] }))}><option value="quasi-TE">quasi-TE</option><option value="quasi-TM">quasi-TM</option></select></label></div>
          <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "coupler" ? "Solving…" : "Solve supermodes"}<span aria-hidden="true">→</span></button>
          {couplerResult && <div className="inline-result"><strong>{couplerResult.couplingLengthUm.toFixed(2)} µm</strong><span>Δneff = {couplerResult.indexSplitting.toExponential(3)}</span></div>}
        </form>
      </div>
      <p className="limitation">Gaussian overlap neglects facet reflection. Coupler length assumes identical, lossless guides and no longitudinal discontinuities.</p>
    </section>

    <section className="sweep-section" aria-labelledby="comparison-title">
      <div className="panel-heading"><div><span className="step">08</span><h2 id="comparison-title">Cross-section comparison</h2></div></div>
      <p className="section-intro">Compare modal power overlap between the current guide and a target platform at the current wavelength. This estimates an abrupt interface, not an optimized taper.</p>
      <form className="analysis-controls" onSubmit={runComparison}>
        <label className="select-field">Target preset<select value={targetPreset} onChange={(event) => setTargetPreset(event.target.value)}>{Object.keys(presets).map((name) => <option key={name}>{name}</option>)}</select></label>
        <AnalysisNumber label="Modes per guide" unit="modes" value={comparisonModes} min={1} max={4} step={1} onChange={setComparisonModes} />
        <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "comparison" ? "Comparing…" : "Compare modes"}<span aria-hidden="true">→</span></button>
      </form>
      {comparisonResult && <div className="comparison-scroll"><table className="comparison-table"><caption>Power overlap at {comparisonResult.wavelengthUm.toFixed(3)} µm</caption><thead><tr><th>Source \ Target</th>{comparisonResult.targetLabels.map((label, index) => <th key={`${label}-${index}`}>{label}</th>)}</tr></thead><tbody>{comparisonResult.sourceLabels.map((sourceLabel, row) => <tr key={`${sourceLabel}-${row}`}><th>{sourceLabel}</th>{comparisonResult.targetLabels.map((targetLabel, column) => <td key={`${targetLabel}-${column}`}><strong>{(100 * comparisonResult.powerOverlap[row][column]).toFixed(2)}%</strong><small>Δn = {comparisonResult.effectiveIndexMismatch[row][column].toExponential(2)}</small></td>)}</tr>)}</tbody></table></div>}
    </section>

    <section className="sweep-section" aria-labelledby="map-title">
      <div className="panel-heading"><div><span className="step">09</span><h2 id="map-title">Mode map</h2></div></div>
      <p className="section-intro">Map guided-mode count and the selected effective index versus wavelength and one geometry parameter.</p>
      <form className="analysis-controls" onSubmit={runModeMap}>
        <label className="select-field">Parameter<select value={modeMap.parameter} onChange={(event) => setModeMap((current) => ({ ...current, parameter: event.target.value as ModeMapParameter }))}><option value="widthUm">Core width</option><option value="heightUm">Core height</option>{geometry === "slot" && <option value="slotGapUm">Slot gap</option>}{geometry === "coupler" && <option value="couplerGapUm">Coupler gap</option>}</select></label>
        <AnalysisNumber label="Geometry start" unit="µm" value={modeMap.startValueUm} min={0.01} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, startValueUm: value }))} /><AnalysisNumber label="Geometry stop" unit="µm" value={modeMap.stopValueUm} min={0.01} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, stopValueUm: value }))} /><AnalysisNumber label="Geometry points" unit="points" value={modeMap.geometryPoints} min={3} max={15} step={1} onChange={(value) => setModeMap((current) => ({ ...current, geometryPoints: value }))} />
        <AnalysisNumber label="λ start" unit="µm" value={modeMap.startWavelengthUm} min={0.2} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, startWavelengthUm: value }))} /><AnalysisNumber label="λ stop" unit="µm" value={modeMap.stopWavelengthUm} min={0.2} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, stopWavelengthUm: value }))} /><AnalysisNumber label="λ points" unit="points" value={modeMap.wavelengthPoints} min={3} max={15} step={1} onChange={(value) => setModeMap((current) => ({ ...current, wavelengthPoints: value }))} /><AnalysisNumber label="Maximum modes" unit="modes" value={modeMap.maximumModes} min={1} max={8} step={1} onChange={(value) => setModeMap((current) => ({ ...current, maximumModes: value }))} /><AnalysisNumber label="Map resolution" unit="cells" value={modeMap.gridResolution} min={24} max={64} step={1} onChange={(value) => setModeMap((current) => ({ ...current, gridResolution: value }))} />
        <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "map" ? "Mapping…" : "Calculate map"}<span aria-hidden="true">→</span></button>
      </form>
      {modeMapResult && <><ModeMapPlot result={modeMapResult} />{modeMapResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</>}
    </section>
    {error && <p className="error analysis-error" role="alert">{error}</p>}
  </>;
}

function AnalysisNumber({ label, unit, value, min, max, step, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(event) => onChange(event.target.valueAsNumber)} /><small>{unit}</small></div></label>;
}

function AnalysisMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function formatOptional(value: number | undefined, digits: number): string { return value === undefined ? "—" : value.toFixed(digits); }
function formatPercent(value: number | undefined): string { return value === undefined ? "—" : `${value.toPrecision(3)}%`; }
function formatCondition(value: number): string { return Number.isFinite(value) ? value.toPrecision(5) : "unresolved"; }
function lossValidationLabel(value: ConvergenceResult["lossValidation"]): string { return value === "pass" ? "Pass" : value === "mesh-only" ? "Mesh only" : value === "not-applicable" ? "No measurable loss" : "Review"; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "The analysis failed."; }

function exportTopology(result: TopologySweepResult) {
  const rows = ["parameter,value,branch,label,neff_real,neff_imag,condition_projected,petermann_projected,residual,tracking_overlap",
    ...result.points.flatMap((point) => point.modes.map((mode) => [result.parameter, point.value, mode.branch + 1, mode.label, mode.effectiveIndex,
      mode.effectiveIndexImaginary, mode.conditionEstimate, mode.petermannFactorEstimate, mode.residual, mode.trackingOverlap].join(",")))];
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `mode-topology-${result.parameter}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
