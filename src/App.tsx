import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ModePlot } from "./ModePlot";
import { SweepPlot } from "./SweepPlot";
import { parseNumericInput } from "./numericInput";
import {
  solveWaveguide,
  sweepWaveguide,
  validateWaveguide,
  PARAMETER_MAXIMUMS,
  type FieldComponent,
  type GeometryType,
  type SolverResult,
  type SweepResult,
  type SweepSettings,
  type WaveguideConfig,
} from "./solver";

const common = {
  geometry: "channel" as GeometryType,
  slabHeightUm: 0.15,
  slotGapUm: 0.12,
  coreExtinction: 0,
  claddingExtinction: 0,
  substrateExtinction: 0,
  coreDispersionPerUm: 0,
  claddingDispersionPerUm: 0,
  substrateDispersionPerUm: 0,
  materialReferenceWavelengthUm: 1.55,
  meshBias: 0,
};

const presets: Record<string, WaveguideConfig> = {
  "Silicon nitride": {
    ...common, wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2,
    claddingIndex: 1.444, substrateIndex: 1.444, paddingUm: 1.2, gridResolution: 40, modeCount: 3,
  },
  Silicon: {
    ...common, wavelengthUm: 1.55, widthUm: 0.45, heightUm: 0.22, slabHeightUm: 0.09,
    slotGapUm: 0.08, coreIndex: 3.476, claddingIndex: 1.444,
    substrateIndex: 1.444, paddingUm: 0.8, gridResolution: 52, modeCount: 2,
  },
  Polymer: {
    ...common, wavelengthUm: 1.55, widthUm: 2, heightUm: 1.2, slabHeightUm: 0.5,
    slotGapUm: 0.25, coreIndex: 1.59, claddingIndex: 1.49,
    substrateIndex: 1.49, paddingUm: 2, gridResolution: 44, modeCount: 3,
  },
};

const initialConfig = presets["Silicon nitride"];
const initialSweep: SweepSettings = { startWavelengthUm: 1.45, stopWavelengthUm: 1.65, points: 9, modeIndex: 0 };
const fieldComponents: FieldComponent[] = ["Ex", "Ey", "Ez", "Hx", "Hy", "Hz", "intensity"];
const fieldLabels: Record<FieldComponent, ReactNode> = {
  Ex: <>E<sub>x</sub></>, Ey: <>E<sub>y</sub></>, Ez: <>E<sub>z</sub></>,
  Hx: <>H<sub>x</sub></>, Hy: <>H<sub>y</sub></>, Hz: <>H<sub>z</sub></>, intensity: "|E|²",
};

export function App() {
  const [draft, setDraft] = useState<WaveguideConfig>(initialConfig);
  const [config, setConfig] = useState<WaveguideConfig>(initialConfig);
  const [result, setResult] = useState<SolverResult>(() => solveWaveguide(initialConfig));
  const [selectedMode, setSelectedMode] = useState(0);
  const [component, setComponent] = useState<FieldComponent>("Ex");
  const [sweepSettings, setSweepSettings] = useState(initialSweep);
  const [sweepResult, setSweepResult] = useState<SweepResult>();
  const [message, setMessage] = useState("Full-vector solution ready.");
  const [sweepMessage, setSweepMessage] = useState("Choose a wavelength range to calculate dispersion.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = result.modes[selectedMode] ?? result.modes[0];
  const validation = useMemo(() => mode ? [
    { label: "Guided solution", pass: mode.effectiveIndex > config.claddingIndex },
    { label: "Eigenpair residual", pass: mode.residual < 2e-3 },
    { label: "Core sampled", pass: Math.min(
      result.xUm.filter((x) => Math.abs(x) <= config.widthUm / 2).length,
      result.yUm.filter((y) => Math.abs(y) <= config.heightUm / 2).length,
    ) >= 8 },
  ] : [], [config, mode, result]);

  function updateNumber(key: keyof WaveguideConfig, value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (preset) setDraft({ ...preset });
  }

  function solve(event: FormEvent) {
    event.preventDefault();
    const errors = validateWaveguide(draft);
    if (errors.length > 0) { setError(errors.join(" ")); return; }
    setError("");
    setBusy(true);
    setMessage("Solving the vector eigenproblem…");
    window.setTimeout(() => {
      try {
        const next = solveWaveguide(draft);
        setConfig({ ...draft });
        setResult(next);
        setSelectedMode(0);
        setSweepResult(undefined);
        setMessage(`${next.modes.length} guided mode${next.modes.length === 1 ? "" : "s"} found on a ${next.nx} × ${next.ny} Yee grid.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The mode solve failed.");
        setMessage("Solve failed.");
      } finally { setBusy(false); }
    }, 20);
  }

  function runSweep(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSweepMessage("Tracking the mode across wavelength…");
    window.setTimeout(() => {
      try {
        const next = sweepWaveguide(config, { ...sweepSettings, modeIndex: selectedMode });
        setSweepResult(next);
        setSweepMessage(`${next.points.length} wavelengths solved with field-overlap mode tracking.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The wavelength sweep failed.");
        setSweepMessage("Sweep failed.");
      } finally { setBusy(false); }
    }, 20);
  }

  function exportField() {
    if (!mode) return;
    const rows = ["x_um,y_um,Ex,Ey,Ez,Hx,Hy,Hz,normalized_E2"];
    for (let row = 0; row < result.yUm.length; row += 1) {
      for (let column = 0; column < result.xUm.length; column += 1) {
        rows.push([result.xUm[column], result.yUm[row], mode.fields.Ex[row][column], mode.fields.Ey[row][column],
          mode.fields.Ez[row][column], mode.fields.Hx[row][column], mode.fields.Hy[row][column],
          mode.fields.Hz[row][column], mode.fields.intensity[row][column]].join(","));
      }
    }
    download(rows.join("\n"), `waveguide-${mode.id.toLowerCase()}-${config.wavelengthUm.toFixed(3)}um.csv`);
  }

  function exportSweep() {
    if (!sweepResult) return;
    const rows = ["wavelength_um,n_eff,n_group,dispersion_ps_nm_km,loss_db_cm,mode_overlap",
      ...sweepResult.points.map((point) => [point.wavelengthUm, point.effectiveIndex, point.groupIndex,
        point.dispersionPsPerNmKm, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), "waveguide-dispersion.csv");
  }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="./" aria-label="Waveguide Mode Solver home">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Waveguide Mode Solver</span>
      </a>
      <div className="header-meta"><span>Full-vector FDM</span><a href="https://github.com/jorpago2/waveguide-mode-solver" target="_blank" rel="noreferrer">GitHub</a></div>
    </header>

    <main>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Integrated photonics · educational solver</p>
        <h1 id="page-title">Inspect and sweep complete vector modes.</h1>
        <p>Model channel, rib, slot and multilayer waveguides with graded meshes, anisotropic materials and wavelength-dependent loss and dispersion.</p>
      </section>

      <div className="workspace">
        <aside className="control-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Waveguide</h2></div><span className="method-chip">FDM</span></div>
          <form onSubmit={solve} noValidate>
            <label>Platform preset<select defaultValue="Silicon nitride" onChange={(event) => applyPreset(event.target.value)}>{Object.keys(presets).map((name) => <option key={name}>{name}</option>)}</select></label>
            <label className="select-field">Geometry<select value={draft.geometry ?? "channel"} onChange={(event) => setDraft((current) => ({ ...current, geometry: event.target.value as GeometryType }))}>
              <option value="channel">Channel</option><option value="rib">Rib</option><option value="slot">Slot</option><option value="multilayer">Multilayer ridge</option>
            </select></label>
            <div className="form-grid">
              <NumberField label="Wavelength" unit="µm" value={draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("wavelengthUm", v)} />
              <NumberField label="Core width" unit="µm" value={draft.widthUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("widthUm", v)} />
              <NumberField label="Core height" unit="µm" value={draft.heightUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("heightUm", v)} />
              <NumberField label="Padding" unit="µm" value={draft.paddingUm} min={0.2} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.1} onChange={(v) => updateNumber("paddingUm", v)} />
              {(draft.geometry ?? "channel") === "rib" && <NumberField label="Slab height" unit="µm" value={draft.slabHeightUm ?? 0.15} min={0.01} max={Number.isFinite(draft.heightUm) ? draft.heightUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slabHeightUm", v)} />}
              {(draft.geometry ?? "channel") === "slot" && <NumberField label="Slot gap" unit="µm" value={draft.slotGapUm ?? 0.12} min={0.01} max={Number.isFinite(draft.widthUm) ? draft.widthUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slotGapUm", v)} />}
              {(draft.geometry ?? "channel") === "multilayer" && <NumberField label="Substrate n" unit="n" value={draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("substrateIndex", v)} />}
              <NumberField label="Core nₓ" unit="n" value={draft.coreIndex} min={1.01} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("coreIndex", v)} />
              <NumberField label="Cladding nₓ" unit="n" value={draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("claddingIndex", v)} />
              <NumberField label="Resolution" unit="cells" value={draft.gridResolution} min={24} max={PARAMETER_MAXIMUMS.gridResolution} step={1} onChange={(v) => updateNumber("gridResolution", v)} />
              <NumberField label="Modes" unit="modes" value={draft.modeCount} min={1} max={PARAMETER_MAXIMUMS.modeCount} step={1} onChange={(v) => updateNumber("modeCount", v)} />
            </div>
            <details className="advanced-controls">
              <summary>Materials & mesh</summary>
              <div className="form-grid">
                <NumberField label="Core nᵧ" unit="n" value={draft.coreIndexY ?? draft.coreIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("coreIndexY", v)} />
                <NumberField label={<>Core n<sub>z</sub></>} unit="n" value={draft.coreIndexZ ?? draft.coreIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("coreIndexZ", v)} />
                <NumberField label="Cladding nᵧ" unit="n" value={draft.claddingIndexY ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("claddingIndexY", v)} />
                <NumberField label={<>Cladding n<sub>z</sub></>} unit="n" value={draft.claddingIndexZ ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("claddingIndexZ", v)} />
                <NumberField label="Core κ" unit="Im(n)" value={draft.coreExtinction ?? 0} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} onChange={(v) => updateNumber("coreExtinction", v)} />
                <NumberField label="Cladding κ" unit="Im(n)" value={draft.claddingExtinction ?? 0} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} onChange={(v) => updateNumber("claddingExtinction", v)} />
                <NumberField label="Core dn/dλ" unit="µm⁻¹" value={draft.coreDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} onChange={(v) => updateNumber("coreDispersionPerUm", v)} />
                <NumberField label="Clad. dn/dλ" unit="µm⁻¹" value={draft.claddingDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} onChange={(v) => updateNumber("claddingDispersionPerUm", v)} />
                {(draft.geometry ?? "channel") === "multilayer" && <>
                  <NumberField label="Substrate nᵧ" unit="n" value={draft.substrateIndexY ?? draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("substrateIndexY", v)} />
                  <NumberField label={<>Substrate n<sub>z</sub></>} unit="n" value={draft.substrateIndexZ ?? draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("substrateIndexZ", v)} />
                  <NumberField label="Substrate κ" unit="Im(n)" value={draft.substrateExtinction ?? 0} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} onChange={(v) => updateNumber("substrateExtinction", v)} />
                  <NumberField label="Substrate dn/dλ" unit="µm⁻¹" value={draft.substrateDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} onChange={(v) => updateNumber("substrateDispersionPerUm", v)} />
                </>}
                <NumberField label="Reference λ" unit="µm" value={draft.materialReferenceWavelengthUm ?? draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("materialReferenceWavelengthUm", v)} />
                <NumberField label="Mesh bias" unit={`0–${PARAMETER_MAXIMUMS.meshBias}`} value={draft.meshBias ?? 0} min={0} max={PARAMETER_MAXIMUMS.meshBias} step={0.1} onChange={(v) => updateNumber("meshBias", v)} />
              </div>
              <p>Real diagonal tensor ε = diag(nₓ², nᵧ², n_z²). κ is included as a first-order modal-loss perturbation; dn/dλ is linear around the reference wavelength.</p>
            </details>
            <button className="solve-button" type="submit" disabled={busy}>Solve modes <span aria-hidden="true">→</span></button>
            <p className="status" aria-live="polite">{message}</p>{error && <p className="error" role="alert">{error}</p>}
          </form>
        </aside>

        <section className="results-panel" aria-labelledby="results-title">
          <div className="panel-heading results-heading"><div><span className="step">02</span><h2 id="results-title">Mode explorer</h2></div><button className="export-button" type="button" onClick={exportField} disabled={!mode}>Export CSV</button></div>
          {mode ? <>
            <div className="mode-tabs" role="tablist" aria-label="Guided modes">{result.modes.map((item, index) => <button type="button" role="tab" aria-selected={selectedMode === index} className={selectedMode === index ? "active" : ""} key={`${item.id}-${index}`} onClick={() => setSelectedMode(index)}><span>{item.polarization}</span><small><i>n</i><sub>eff</sub> {item.effectiveIndex.toFixed(5)}</small></button>)}</div>
            <div className="metrics">
              <Metric label={<>Effective index <i>n</i><sub>eff</sub></>} value={mode.effectiveIndex.toFixed(6)} />
              <Metric label={<>Propagation constant β</>} value={`${mode.propagationConstantPerUm.toFixed(4)} µm⁻¹`} />
              <Metric label="Electric confinement" value={`${(mode.electricConfinement * 100).toFixed(1)}%`} />
              <Metric label={<>Effective area <i>A</i><sub>eff</sub></>} value={`${mode.effectiveAreaUm2.toFixed(3)} µm²`} />
              <Metric label="Material loss" value={`${mode.lossDbPerCm.toPrecision(3)} dB/cm`} />
            </div>
            <div className="field-toolbar" aria-label="Field component"><span>Field</span>{fieldComponents.map((field) => <button type="button" className={component === field ? "active" : ""} aria-pressed={component === field} key={field} onClick={() => setComponent(field)}>{fieldLabels[field]}</button>)}</div>
            <ModePlot component={component} config={config} mode={mode} xUm={result.xUm} yUm={result.yUm} />
          </> : <div className="empty-state">No guided mode was found. Increase the core size or index contrast.</div>}
        </section>
      </div>

      <section className="sweep-section">
        <div className="panel-heading"><div><span className="step">03</span><h2>Wavelength sweep</h2></div><button className="export-button" type="button" disabled={!sweepResult} onClick={exportSweep}>Export CSV</button></div>
        <form className="sweep-controls" onSubmit={runSweep}>
          <NumberField label="Start wavelength" unit="µm" value={sweepSettings.startWavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(value) => setSweepSettings((current) => ({ ...current, startWavelengthUm: value }))} />
          <NumberField label="Stop wavelength" unit="µm" value={sweepSettings.stopWavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(value) => setSweepSettings((current) => ({ ...current, stopWavelengthUm: value }))} />
          <NumberField label="Samples" unit="points" value={sweepSettings.points} min={5} max={PARAMETER_MAXIMUMS.sweepPoints} step={2} onChange={(value) => setSweepSettings((current) => ({ ...current, points: value }))} />
          <button className="solve-button" type="submit" disabled={busy || !mode}>Run sweep <span aria-hidden="true">→</span></button>
        </form>
        <p className="status" aria-live="polite">{sweepMessage}</p>
        {sweepResult && <><SweepPlot result={sweepResult} />{sweepResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</>}
      </section>

      <section className="validation-section">
        <div className="method-card"><p className="eyebrow">Numerical model</p><h2>Full-vector finite-difference eigenmode method</h2><p>The solver discretizes Maxwell’s equations on a transverse Yee grid and solves the coupled eigenproblem for <i>H</i><sub>x</sub> and <i>H</i><sub>y</sub>. Nonuniform finite differences sample the core more densely when mesh bias is enabled.</p><div className="equation"><span>U</span><b>H</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>H</b><sub>t</sub></div><p className="limitation">Scope: linear, non-magnetic dielectrics with diagonal anisotropy and hard outer boundaries. Material loss is perturbative, not a complex-eigenvalue or radiation-loss solution.</p></div>
        <div className="checks-card"><p className="eyebrow">Current solution</p><h2>Validation checks</h2><div className="checks">{validation.map((check) => <div key={check.label}><span className={check.pass ? "pass" : "warn"}>{check.pass ? "Pass" : "Review"}</span><strong>{check.label}</strong></div>)}</div>{mode && <dl className="solver-details"><div><dt>Relative residual</dt><dd>{mode.residual.toExponential(2)}</dd></div><div><dt>Grid spacing range</dt><dd>{result.dxUm.toFixed(3)}–{result.dxMaxUm.toFixed(3)} µm</dd></div><div><dt>Longitudinal E fraction</dt><dd>{(mode.longitudinalElectricFraction * 100).toFixed(2)}%</dd></div><div><dt>Eₓ transverse fraction</dt><dd>{(mode.xPolarizedElectricFraction * 100).toFixed(2)}%</dd></div></dl>}{result.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</div>
      </section>
    </main>
    <footer><span>Waveguide Mode Solver</span><span>Built for photonics education · Check mesh, boundary and sweep convergence before design use.</span></footer>
  </div>;
}

function NumberField({ label, unit, value, min, max, step, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(event) => onChange(parseNumericInput(event.target.value))} /><small>{unit}</small></div></label>;
}

function Metric({ label, value }: { label: ReactNode; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
