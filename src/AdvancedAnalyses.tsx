import { useState, type FormEvent, type ReactNode } from "react";
import { parseNumericInput } from "./numericInput";
import { runSolverWorker } from "./workerClient";
import { ModeMapPlot, TolerancePlot } from "./AnalysisPlots";
import type {
  DirectionalCouplerResult, DirectionalCouplerSettings, GaussianCouplingResult, GaussianCouplingSettings,
  ModeMapParameter, ModeMapResult, ModeMapSettings, ToleranceResult, ToleranceSettings,
} from "./analysis";
import type { SolverResult, WaveguideConfig } from "./solver";

interface Props {
  config: WaveguideConfig;
  result?: SolverResult;
  selectedMode: number;
}

const initialTolerance: ToleranceSettings = { widthStdDevNm: 10, heightStdDevNm: 5, gapStdDevNm: 5, coreIndexStdDev: 0.001, samples: 12, seed: 2026, modeIndex: 0 };
const initialGaussian: GaussianCouplingSettings = { waistUm: 1.5, offsetXUm: 0, offsetYUm: 0, polarizationAngleDeg: 0 };
const initialCoupler: DirectionalCouplerSettings = { gapUm: 0.2, polarization: "quasi-TE" };
const initialMap: ModeMapSettings = { parameter: "widthUm", startValueUm: 0.5, stopValueUm: 1.5, geometryPoints: 5, startWavelengthUm: 1.45, stopWavelengthUm: 1.65, wavelengthPoints: 5, maximumModes: 4, gridResolution: 24, modeIndex: 0 };

export function AdvancedAnalyses({ config, result, selectedMode }: Props) {
  const [active, setActive] = useState<string>();
  const [error, setError] = useState("");
  const [tolerance, setTolerance] = useState(initialTolerance);
  const [toleranceResult, setToleranceResult] = useState<ToleranceResult>();
  const [gaussian, setGaussian] = useState(initialGaussian);
  const [gaussianResult, setGaussianResult] = useState<GaussianCouplingResult>();
  const [coupler, setCoupler] = useState(initialCoupler);
  const [couplerResult, setCouplerResult] = useState<DirectionalCouplerResult>();
  const [modeMap, setModeMap] = useState(initialMap);
  const [modeMapResult, setModeMapResult] = useState<ModeMapResult>();

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

  const geometry = config.geometry ?? "channel";
  const gapAvailable = geometry === "slot" || geometry === "coupler";
  return <>
    <section className="sweep-section" aria-labelledby="tolerance-title">
      <div className="panel-heading"><div><span className="step">05</span><h2 id="tolerance-title">Fabrication tolerances</h2></div></div>
      <p className="section-intro">Run a seeded Latin-hypercube Monte Carlo study. Inputs are independent Gaussian standard deviations.</p>
      <form className="analysis-controls" onSubmit={runTolerance}>
        <AnalysisNumber label="Width σ" unit="nm" value={tolerance.widthStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, widthStdDevNm: value }))} />
        <AnalysisNumber label="Height σ" unit="nm" value={tolerance.heightStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, heightStdDevNm: value }))} />
        {gapAvailable && <AnalysisNumber label="Gap σ" unit="nm" value={tolerance.gapStdDevNm} min={0} max={1_000} step={1} onChange={(value) => setTolerance((current) => ({ ...current, gapStdDevNm: value }))} />}
        <AnalysisNumber label="Core-index σ" unit="n" value={tolerance.coreIndexStdDev} min={0} max={1} step={0.0001} onChange={(value) => setTolerance((current) => ({ ...current, coreIndexStdDev: value }))} />
        <AnalysisNumber label="Samples" unit="runs" value={tolerance.samples} min={6} max={100} step={1} onChange={(value) => setTolerance((current) => ({ ...current, samples: value }))} />
        <AnalysisNumber label="Seed" unit="integer" value={tolerance.seed} min={0} max={2_147_483_647} step={1} onChange={(value) => setTolerance((current) => ({ ...current, seed: value }))} />
        <button className="solve-button" type="submit" disabled={Boolean(active) || !result}>{active === "tolerance" ? "Sampling…" : "Run tolerances"}<span aria-hidden="true">→</span></button>
      </form>
      {toleranceResult && <><div className="analysis-metrics"><AnalysisMetric label="Mean neff" value={toleranceResult.effectiveIndex.mean.toFixed(6)} /><AnalysisMetric label="neff σ" value={toleranceResult.effectiveIndex.standardDeviation.toExponential(3)} /><AnalysisMetric label="90% interval" value={`${toleranceResult.effectiveIndex.p05.toFixed(5)}–${toleranceResult.effectiveIndex.p95.toFixed(5)}`} /><AnalysisMetric label="Strongest correlation" value={toleranceResult.effectiveIndexSensitivity[0] ? `${toleranceResult.effectiveIndexSensitivity[0].parameter} (${toleranceResult.effectiveIndexSensitivity[0].correlation.toFixed(2)})` : "—"} /><AnalysisMetric label="Valid samples" value={`${toleranceResult.samples.length}/${toleranceResult.samples.length + toleranceResult.failedSamples}`} /></div><TolerancePlot result={toleranceResult} /></>}
    </section>

    <section className="sweep-section" aria-labelledby="coupling-title">
      <div className="panel-heading"><div><span className="step">06</span><h2 id="coupling-title">Coupling analysis</h2></div></div>
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

    <section className="sweep-section" aria-labelledby="map-title">
      <div className="panel-heading"><div><span className="step">07</span><h2 id="map-title">Mode map</h2></div></div>
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
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(event) => onChange(parseNumericInput(event.target.value))} /><small>{unit}</small></div></label>;
}

function AnalysisMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "The analysis failed."; }
