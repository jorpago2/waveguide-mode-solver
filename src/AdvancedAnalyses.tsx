import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, InlineLoading, InlineNotification, Tile } from "@carbon/react";
import packageJson from "../package.json";
import { CarbonCheckboxField, CarbonNumberField, CarbonSelectField, CarbonSwitcher, CarbonTable } from "./CarbonControls";
import { cancelSolverWorker, isSolverWorkerCancellation, runSolverWorker } from "./workerClient";
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
const analysisPaneTabs = [
  { value: "numerics", label: "Numerics", id: "analysis-tab-numerics", controlsId: "analysis-panel-numerics" },
  { value: "robustness", label: "Robustness", id: "analysis-tab-robustness", controlsId: "analysis-panel-robustness" },
  { value: "coupling", label: "Coupling", id: "analysis-tab-coupling", controlsId: "analysis-panel-coupling" },
];

export function AdvancedAnalyses({ config, result, selectedMode, presets }: Props) {
  const [active, setActive] = useState<string>();
  const [error, setError] = useState("");
  const [runMessage, setRunMessage] = useState("");
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
  const [exportMessage, setExportMessage] = useState("");
  const [analysisPane, setAnalysisPane] = useState<"numerics" | "robustness" | "coupling">("numerics");

  useEffect(() => {
    if ((config.geometry ?? "channel") !== "polygon") return;
    setTopology((current) => current.parameter === "wavelengthUm" ? current : {
      parameter: "wavelengthUm", startValue: 0.8 * config.wavelengthUm, stopValue: 1.2 * config.wavelengthUm, points: current.points,
    });
  }, [config.geometry, config.wavelengthUm]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => window.cancelAnimationFrame(frame);
  }, [analysisPane]);

  function startAnalysis(name: string) { setActive(name); setError(""); setRunMessage(""); }
  function handleAnalysisError(caught: unknown) {
    if (isSolverWorkerCancellation(caught)) setRunMessage("Analysis cancelled; previous results were kept.");
    else setError(errorMessage(caught));
  }

  async function runConvergence(event: FormEvent) {
    event.preventDefault(); startAnalysis("convergence");
    try { setConvergenceResult(await runSolverWorker<ConvergenceResult>({ kind: "convergence", config, settings: { ...convergence, modeIndex: selectedMode } })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  async function runTolerance(event: FormEvent) {
    event.preventDefault(); startAnalysis("tolerance");
    try { setToleranceResult(await runSolverWorker<ToleranceResult>({ kind: "tolerances", config, settings: { ...tolerance, modeIndex: selectedMode } })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  async function runGaussian(event: FormEvent) {
    event.preventDefault(); if (!result) return; startAnalysis("gaussian");
    try { setGaussianResult(await runSolverWorker<GaussianCouplingResult>({ kind: "gaussianCoupling", result, modeIndex: selectedMode, settings: gaussian })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  async function runCoupler(event: FormEvent) {
    event.preventDefault(); startAnalysis("coupler");
    try { setCouplerResult(await runSolverWorker<DirectionalCouplerResult>({ kind: "directionalCoupler", config, settings: coupler })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  async function runModeMap(event: FormEvent) {
    event.preventDefault(); startAnalysis("map");
    try { setModeMapResult(await runSolverWorker<ModeMapResult>({ kind: "modeMap", config, settings: { ...modeMap, modeIndex: selectedMode } })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  async function runComparison(event: FormEvent) {
    event.preventDefault(); startAnalysis("comparison");
    try { setComparisonResult(await runSolverWorker<WaveguideComparisonResult>({ kind: "compareWaveguides", sourceConfig: config, targetConfig: presets[targetPreset], maximumModes: comparisonModes })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  async function runTopology(event: FormEvent) {
    event.preventDefault(); startAnalysis("topology"); setExportMessage("");
    try { setTopologyResult(await runSolverWorker<TopologySweepResult>({ kind: "modeTopology", config, settings: topology })); }
    catch (caught) { handleAnalysisError(caught); } finally { setActive(undefined); }
  }

  function selectTopologyParameter(parameter: TopologySweepParameter) {
    const centre = parameter === "wavelengthUm" ? config.wavelengthUm : parameter === "coreExtinction" ? config.coreExtinction ?? 0.01
      : parameter === "slotGapUm" ? config.slotGapUm ?? config.widthUm / 5 : parameter === "couplerGapUm" ? config.couplerGapUm ?? config.widthUm / 2 : config[parameter];
    const span = parameter === "coreExtinction" ? Math.max(0.01, centre) : 0.2 * centre;
    setTopology({ parameter, startValue: Math.max(parameter === "wavelengthUm" ? 0.2 : parameter === "coreExtinction" ? 0 : 0.001, centre - span), stopValue: centre + span, points: topology.points });
  }

  function downloadTopology() {
    if (!topologyResult) return;
    const filename = exportTopology(topologyResult, config, topology);
    setExportMessage(`Topology sweep exported as ${filename}.`);
  }

  const geometry = config.geometry ?? "channel";
  const gapAvailable = geometry === "slot" || geometry === "coupler";
  const selected = result?.modes[selectedMode];
  const maximumRightOverlap = result && result.modes.length > 1
    ? Math.max(0, ...(result.ritzNonOrthogonality[selectedMode] ?? []).filter((_, index) => index !== selectedMode)) : 0;
  return <>
    <div className="section-tabs">
      <CarbonSwitcher label="Analysis category" value={analysisPane} options={analysisPaneTabs} onChange={(value) => setAnalysisPane(value as typeof analysisPane)} />
    </div>
    {active && <div className="analysis-cancel"><InlineLoading description="Analysis running…" /><Button kind="danger--tertiary" type="button" onClick={cancelSolverWorker}>Cancel analysis</Button></div>}
    {runMessage && <InlineNotification lowContrast hideCloseButton kind="info" title="Analysis status" subtitle={runMessage} />}
    <section id="analysis-panel-numerics" role="tabpanel" aria-labelledby="analysis-tab-numerics" hidden={analysisPane !== "numerics"}>
    <section className="sweep-section tabbed-section" aria-labelledby="topology-title">
      <div className="panel-heading"><div><h2 id="topology-title">Mode interactions &amp; sensitivity</h2></div>{topologyResult && <Button kind="tertiary" type="button" onClick={downloadTopology}>Export CSV</Button>}</div>
      {exportMessage && <InlineNotification lowContrast hideCloseButton kind="success" title="Export complete" subtitle={exportMessage} />}
      <p className="section-intro">Inspect mode mixing and numerical sensitivity in lossy, leaky or strongly coupled structures. Complex-index trajectories can flag interactions for closer study; exceptional-point labels remain provisional until verified with a converged two-parameter loop.</p>
      {selected && <div className="analysis-metrics">
        <AnalysisMetric label="Projected condition κ" value={formatCondition(selected.eigenvalueConditionEstimate)} />
        <AnalysisMetric label="Projected Petermann K" value={formatCondition(selected.petermannFactorEstimate)} />
        <AnalysisMetric label="Largest right-mode overlap" value={maximumRightOverlap.toFixed(4)} />
        <AnalysisMetric label="Eigenpair residual" value={selected.residual.toExponential(2)} />
      </div>}
      {result && result.modes.length > 1 && <CarbonTable title="Absolute overlaps between normalized right Ritz vectors" headers={["Mode", ...result.modes.map((mode) => mode.label)]} rows={result.modes.map((mode, row) => ({ id: mode.id, cells: [mode.label, ...result.ritzNonOrthogonality[row].map((overlap) => overlap.toFixed(4))] }))} />}
      <form className="analysis-controls" onSubmit={runTopology} noValidate>
        <CarbonSelectField label="Sweep parameter" value={topology.parameter} options={[...(geometry === "polygon" ? [] : [{ value: "widthUm", label: "Core width" }, { value: "heightUm", label: "Core height" }]), ...(geometry === "slot" ? [{ value: "slotGapUm", label: "Slot gap" }] : []), ...(geometry === "coupler" ? [{ value: "couplerGapUm", label: "Coupler gap" }] : []), { value: "wavelengthUm", label: "Wavelength" }, ...(geometry === "polygon" ? [] : [{ value: "coreExtinction", label: "Core extinction" }])]} onChange={(value) => selectTopologyParameter(value as TopologySweepParameter)} />
        <AnalysisNumber label="Start" unit={topology.parameter === "coreExtinction" ? "κ" : "µm"} value={topology.startValue} min={topology.parameter === "wavelengthUm" ? 0.2 : 0} max={1_000} step={topology.parameter === "coreExtinction" ? 0.001 : 0.01} onChange={(value) => setTopology((current) => ({ ...current, startValue: value }))} />
        <AnalysisNumber label="Stop" unit={topology.parameter === "coreExtinction" ? "κ" : "µm"} value={topology.stopValue} min={topology.parameter === "wavelengthUm" ? 0.2 : 0} max={1_000} step={topology.parameter === "coreExtinction" ? 0.001 : 0.01} onChange={(value) => setTopology((current) => ({ ...current, stopValue: value }))} />
        <AnalysisNumber label="Points" unit="solves" value={topology.points} min={5} max={31} step={1} onChange={(value) => setTopology((current) => ({ ...current, points: value }))} />
        <Button className="solve-button" type="submit" disabled={Boolean(active) || !result || config.modeCount < 2}>{active === "topology" ? "Tracking…" : "Analyze branches"}</Button>
      </form>
      {config.modeCount < 2 && <InlineNotification lowContrast hideCloseButton kind="warning" title="More modes required" subtitle="Request at least two modes in the solver configuration before running topology analysis." />}
      {topologyResult && <><ModeTopologyPlot result={topologyResult} />{topologyResult.interactions.length > 0 && <CarbonTable title="Local minima of the complex modal separation" headers={["Parameter", "Branches", "Classification", "|Δneff|", "Right overlap", "κproj"]} rows={topologyResult.interactions.map((interaction) => ({ id: `${interaction.value}-${interaction.branches.join("-")}`, cells: [interaction.value.toPrecision(5), interaction.branches.map((branch) => branch + 1).join(" / "), interaction.classification, interaction.complexIndexGap.toExponential(3), interaction.rightModeOverlap.toFixed(4), formatCondition(interaction.maximumConditionEstimate)] }))} />}{topologyResult.warnings.map((warning) => <InlineNotification lowContrast hideCloseButton kind="warning" title="Topology warning" subtitle={warning} key={warning} />)}</>}
      <p className="limitation">K<sub>proj</sub> = κ<sub>proj</sub>² is obtained from left and right eigenvectors of the Arnoldi-projected operator. It is a convergence diagnostic, not yet the full Maxwell adjoint Petermann factor.</p>
    </section>
    <section className="sweep-section tabbed-section" aria-labelledby="convergence-title">
      <div className="panel-heading"><div><h2 id="convergence-title">Numerical convergence</h2></div></div>
      <p className="section-intro">Track the selected mode over three systematically refined meshes. Loss is checked against the selected tolerance and, with PML, against boundary and absorber variations.</p>
      <form className="analysis-controls" onSubmit={runConvergence} noValidate>
        <AnalysisNumber label="Coarse resolution" unit="cells" value={convergence.coarseResolution} min={24} max={56} step={1} onChange={(value) => setConvergence((current) => ({ ...current, coarseResolution: value }))} />
        <AnalysisNumber label="Refinement ratio" unit="r" value={convergence.refinementRatio} min={1.3} max={2} step={0.05} onChange={(value) => setConvergence((current) => ({ ...current, refinementRatio: value }))} />
        <AnalysisNumber label="Loss tolerance" unit="%" value={convergence.lossTolerancePercent} min={0.1} max={100} step={0.5} onChange={(value) => setConvergence((current) => ({ ...current, lossTolerancePercent: value }))} />
        {(config.boundary ?? "hard") === "pml" && <CarbonCheckboxField label="Test PML sensitivity" checked={convergence.includePmlSensitivity} onChange={(checked) => setConvergence((current) => ({ ...current, includePmlSensitivity: checked }))} />}
        <Button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "convergence" ? "Verifying…" : "Run convergence"}</Button>
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
          <CarbonTable title="One-at-a-time boundary and PML robustness checks on the finest mesh" headers={["Variation", "Grid", "Padding", "PML thickness", "Strength", "neff", "Loss", "Δloss", "Overlap"]} rows={convergenceResult.pmlSensitivity.points.map((point) => ({ id: point.name, cells: point.error ? [point.name, point.resolution, `${point.paddingUm.toFixed(3)} µm`, `${point.thicknessUm.toFixed(3)} µm`, point.strength.toFixed(2), { content: point.error, colSpan: 4, className: "failed-check" }] : [point.name, point.resolution, `${point.paddingUm.toFixed(3)} µm`, `${point.thicknessUm.toFixed(3)} µm`, point.strength.toFixed(2), point.effectiveIndex!.toFixed(7), `${point.lossDbPerCm!.toPrecision(4)} dB/cm`, `${point.lossChangePercent!.toPrecision(3)}%`, `${(100 * point.overlap!).toFixed(2)}%`] }))} />
        </>}
        {convergenceResult.warnings.map((warning) => <InlineNotification lowContrast hideCloseButton kind="warning" title="Convergence warning" subtitle={warning} key={warning} />)}
      </>}
      <p className="limitation">GCI quantifies mesh discretization uncertainty in effective index. PML checks are sensitivity tests, not proof that the computed attenuation is a physical leakage rate.</p>
    </section>
    </section>

    <section id="analysis-panel-robustness" role="tabpanel" aria-labelledby="analysis-tab-robustness" hidden={analysisPane !== "robustness"}>
    <section className="sweep-section tabbed-section" aria-labelledby="tolerance-title">
      <div className="panel-heading"><div><h2 id="tolerance-title">Fabrication tolerances</h2></div></div>
      <p className="section-intro">Run a seeded Latin-hypercube Monte Carlo study. Inputs are independent Gaussian standard deviations.</p>
      <form className="analysis-controls" onSubmit={runTolerance} noValidate>
        <AnalysisNumber label="Width σ" unit="nm" value={tolerance.widthStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, widthStdDevNm: value }))} />
        <AnalysisNumber label="Height σ" unit="nm" value={tolerance.heightStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, heightStdDevNm: value }))} />
        {gapAvailable && <AnalysisNumber label="Gap σ" unit="nm" value={tolerance.gapStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, gapStdDevNm: value }))} />}
        <AnalysisNumber label="Sidewall-angle σ" unit="deg" value={tolerance.sidewallAngleStdDevDeg} min={0} max={20} step={0.1} onChange={(value) => setTolerance((current) => ({ ...current, sidewallAngleStdDevDeg: value }))} />
        <AnalysisNumber label="Core-index σ" unit="n" value={tolerance.coreIndexStdDev} min={0} max={1} step={0.0001} onChange={(value) => setTolerance((current) => ({ ...current, coreIndexStdDev: value }))} />
        <AnalysisNumber label="Samples" unit="runs" value={tolerance.samples} min={6} max={100} step={1} onChange={(value) => setTolerance((current) => ({ ...current, samples: value }))} />
        <AnalysisNumber label="Seed" unit="integer" value={tolerance.seed} min={0} max={2_147_483_647} step={1} onChange={(value) => setTolerance((current) => ({ ...current, seed: value }))} />
        <Button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "tolerance" ? "Sampling…" : "Run tolerances"}</Button>
      </form>
      {toleranceResult && <><div className="analysis-metrics"><AnalysisMetric label="Mean neff" value={toleranceResult.effectiveIndex.mean.toFixed(6)} /><AnalysisMetric label="neff σ" value={toleranceResult.effectiveIndex.standardDeviation.toExponential(3)} /><AnalysisMetric label="90% interval" value={`${toleranceResult.effectiveIndex.p05.toFixed(5)}–${toleranceResult.effectiveIndex.p95.toFixed(5)}`} /><AnalysisMetric label="Strongest correlation" value={toleranceResult.effectiveIndexSensitivity[0] ? `${toleranceResult.effectiveIndexSensitivity[0].parameter} (${toleranceResult.effectiveIndexSensitivity[0].correlation.toFixed(2)})` : "—"} /><AnalysisMetric label="Valid samples" value={`${toleranceResult.samples.length}/${toleranceResult.samples.length + toleranceResult.failedSamples}`} /></div><TolerancePlot result={toleranceResult} /></>}
    </section>

    <section className="sweep-section tabbed-section" aria-labelledby="map-title">
      <div className="panel-heading"><div><h2 id="map-title">Mode map</h2></div></div>
      <p className="section-intro">Map guided-mode count and the selected effective index versus wavelength and one geometry parameter.</p>
      <form className="analysis-controls" onSubmit={runModeMap} noValidate>
        <CarbonSelectField label="Parameter" value={modeMap.parameter} options={[{ value: "widthUm", label: "Core width" }, { value: "heightUm", label: "Core height" }, ...(geometry === "slot" ? [{ value: "slotGapUm", label: "Slot gap" }] : []), ...(geometry === "coupler" ? [{ value: "couplerGapUm", label: "Coupler gap" }] : [])]} onChange={(value) => setModeMap((current) => ({ ...current, parameter: value as ModeMapParameter }))} />
        <AnalysisNumber label="Geometry start" unit="µm" value={modeMap.startValueUm} min={0.01} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, startValueUm: value }))} /><AnalysisNumber label="Geometry stop" unit="µm" value={modeMap.stopValueUm} min={0.01} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, stopValueUm: value }))} /><AnalysisNumber label="Geometry points" unit="points" value={modeMap.geometryPoints} min={3} max={15} step={1} onChange={(value) => setModeMap((current) => ({ ...current, geometryPoints: value }))} />
        <AnalysisNumber label="λ start" unit="µm" value={modeMap.startWavelengthUm} min={0.2} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, startWavelengthUm: value }))} /><AnalysisNumber label="λ stop" unit="µm" value={modeMap.stopWavelengthUm} min={0.2} max={1_000} step={0.01} onChange={(value) => setModeMap((current) => ({ ...current, stopWavelengthUm: value }))} /><AnalysisNumber label="λ points" unit="points" value={modeMap.wavelengthPoints} min={3} max={15} step={1} onChange={(value) => setModeMap((current) => ({ ...current, wavelengthPoints: value }))} /><AnalysisNumber label="Maximum modes" unit="modes" value={modeMap.maximumModes} min={1} max={8} step={1} onChange={(value) => setModeMap((current) => ({ ...current, maximumModes: value }))} /><AnalysisNumber label="Map resolution" unit="cells" value={modeMap.gridResolution} min={24} max={64} step={1} onChange={(value) => setModeMap((current) => ({ ...current, gridResolution: value }))} />
        <Button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "map" ? "Mapping…" : "Calculate map"}</Button>
      </form>
      {modeMapResult && <><ModeMapPlot result={modeMapResult} />{modeMapResult.warnings.map((warning) => <InlineNotification lowContrast hideCloseButton kind="warning" title="Mode-map warning" subtitle={warning} key={warning} />)}</>}
    </section>
    </section>

    <section id="analysis-panel-coupling" role="tabpanel" aria-labelledby="analysis-tab-coupling" hidden={analysisPane !== "coupling"}>
    <section className="sweep-section tabbed-section" aria-labelledby="coupling-title">
      <div className="panel-heading"><div><h2 id="coupling-title">Coupling analysis</h2></div></div>
      <div className="analysis-columns">
        <form className="analysis-card" onSubmit={runGaussian} noValidate>
          <h3>Gaussian-beam overlap</h3><p>Approximate butt-coupling overlap with a linearly polarized Gaussian field.</p>
          <div className="analysis-controls compact"><AnalysisNumber label="1/e field radius" unit="µm" value={gaussian.waistUm} min={0.05} max={100} step={0.05} onChange={(value) => setGaussian((current) => ({ ...current, waistUm: value }))} /><AnalysisNumber label="x offset" unit="µm" value={gaussian.offsetXUm} min={-100} max={100} step={0.05} onChange={(value) => setGaussian((current) => ({ ...current, offsetXUm: value }))} /><AnalysisNumber label="y offset" unit="µm" value={gaussian.offsetYUm} min={-100} max={100} step={0.05} onChange={(value) => setGaussian((current) => ({ ...current, offsetYUm: value }))} /><AnalysisNumber label="Polarization" unit="deg" value={gaussian.polarizationAngleDeg} min={-180} max={180} step={1} onChange={(value) => setGaussian((current) => ({ ...current, polarizationAngleDeg: value }))} /></div>
          <Button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "gaussian" ? "Calculating…" : "Calculate overlap"}</Button>
          {gaussianResult && <div className="inline-result"><strong>{(100 * gaussianResult.efficiency).toFixed(2)}%</strong><span>{gaussianResult.couplingLossDb.toFixed(2)} dB coupling loss</span></div>}
        </form>
        <form className="analysis-card" onSubmit={runCoupler} noValidate>
          <h3>Directional coupler</h3><p>Solve even and odd supermodes of two identical guides and derive the full-transfer length.</p>
          <div className="analysis-controls compact"><AnalysisNumber label="Guide gap" unit="µm" value={coupler.gapUm} min={0.01} max={100} step={0.01} onChange={(value) => setCoupler((current) => ({ ...current, gapUm: value }))} /><CarbonSelectField label="Polarization" value={coupler.polarization} options={[{ value: "quasi-TE", label: "quasi-TE" }, { value: "quasi-TM", label: "quasi-TM" }]} onChange={(value) => setCoupler((current) => ({ ...current, polarization: value as DirectionalCouplerSettings["polarization"] }))} /></div>
          <Button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "coupler" ? "Solving…" : "Solve supermodes"}</Button>
          {couplerResult && <div className="inline-result"><strong>{couplerResult.couplingLengthUm.toFixed(2)} µm</strong><span>Δneff = {couplerResult.indexSplitting.toExponential(3)}</span></div>}
        </form>
      </div>
      <p className="limitation">Gaussian overlap neglects facet reflection. Coupler length assumes identical, lossless guides and no longitudinal discontinuities.</p>
    </section>

    <section className="sweep-section tabbed-section" aria-labelledby="comparison-title">
      <div className="panel-heading"><div><h2 id="comparison-title">Cross-section comparison</h2></div></div>
      <p className="section-intro">Compare modal power overlap between the current guide and a target platform at the current wavelength. This estimates an abrupt interface, not an optimized taper.</p>
      <form className="analysis-controls" onSubmit={runComparison} noValidate>
        <CarbonSelectField label="Target preset" value={targetPreset} options={Object.keys(presets).map((name) => ({ value: name, label: name }))} onChange={setTargetPreset} />
        <AnalysisNumber label="Modes per guide" unit="modes" value={comparisonModes} min={1} max={4} step={1} onChange={setComparisonModes} />
        <Button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "comparison" ? "Comparing…" : "Compare modes"}</Button>
      </form>
      {comparisonResult && <CarbonTable title={`Power overlap at ${comparisonResult.wavelengthUm.toFixed(3)} µm`} headers={["Source / Target", ...comparisonResult.targetLabels]} rows={comparisonResult.sourceLabels.map((sourceLabel, row) => ({ id: `${sourceLabel}-${row}`, cells: [sourceLabel, ...comparisonResult.targetLabels.map((_, column) => <><strong>{(100 * comparisonResult.powerOverlap[row][column]).toFixed(2)}%</strong><small>Δn = {comparisonResult.effectiveIndexMismatch[row][column].toExponential(2)}</small></>)] }))} />}
    </section>

    </section>
    {error && <InlineNotification lowContrast hideCloseButton kind="error" title="Analysis failed" subtitle={error} />}
  </>;
}

function AnalysisNumber({ label, unit, value, min, max, step, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <CarbonNumberField label={label} unit={unit} value={value} min={min} max={max} step={step} onChange={onChange} />;
}

function AnalysisMetric({ label, value }: { label: string; value: string }) { return <Tile><span>{label}</span><strong>{value}</strong></Tile>; }
function formatOptional(value: number | undefined, digits: number): string { return value === undefined ? "—" : value.toFixed(digits); }
function formatPercent(value: number | undefined): string { return value === undefined ? "—" : `${value.toPrecision(3)}%`; }
function formatCondition(value: number): string { return Number.isFinite(value) ? value.toPrecision(5) : "unresolved"; }
function lossValidationLabel(value: ConvergenceResult["lossValidation"]): string { return value === "pass" ? "Pass" : value === "mesh-only" ? "Mesh only" : value === "not-applicable" ? "No measurable loss" : "Review"; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "The analysis failed."; }

function exportTopology(result: TopologySweepResult, config: WaveguideConfig, settings: TopologySweepSettings) {
  const rows = [`# metadata_json=${JSON.stringify({ solverVersion: packageJson.version, config, settings })}`, "parameter,value,branch,label,neff_real,neff_imag,condition_projected,petermann_projected,residual,tracking_overlap",
    ...result.points.flatMap((point) => point.modes.map((mode) => [result.parameter, point.value, mode.branch + 1, mode.label, mode.effectiveIndex,
      mode.effectiveIndexImaginary, mode.conditionEstimate, mode.petermannFactorEstimate, mode.residual, mode.trackingOverlap].join(",")))];
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  const filename = `waveguide-${config.geometry ?? "channel"}-topology-${result.parameter}.csv`;
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  return filename;
}
