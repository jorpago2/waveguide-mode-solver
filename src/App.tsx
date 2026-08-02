import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ModePlot } from "./ModePlot";
import { SweepPlot } from "./SweepPlot";
import { GeometrySweepPlot } from "./GeometrySweepPlot";
import { parseNumericInput } from "./numericInput";
import { runSolverWorker } from "./workerClient";
import { AdvancedAnalyses } from "./AdvancedAnalyses";
import { MATERIALS, evaluateMaterial, materialDefinition, type MaterialId } from "./materials";
import {
  validateWaveguide,
  PARAMETER_MAXIMUMS,
  type FieldComponent,
  type GeometryType,
  type GeometrySweepParameter,
  type GeometrySweepResult,
  type GeometrySweepSettings,
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
  boundary: "hard" as const,
  pmlThicknessUm: 0.6,
  pmlStrength: 4,
  coreMaterial: "custom" as MaterialId,
  claddingMaterial: "custom" as MaterialId,
  substrateMaterial: "custom" as MaterialId,
  couplerGapUm: 0.2,
};

const presets: Record<string, WaveguideConfig> = {
  "Silicon nitride": {
    ...common, wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2,
    claddingIndex: 1.444, substrateIndex: 1.444, coreMaterial: "silicon-nitride", claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 1.2, gridResolution: 40, modeCount: 3,
  },
  Silicon: {
    ...common, wavelengthUm: 1.55, widthUm: 0.45, heightUm: 0.22, slabHeightUm: 0.09,
    slotGapUm: 0.08, coreIndex: 3.476, claddingIndex: 1.444,
    substrateIndex: 1.444, coreMaterial: "silicon", claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 0.8, gridResolution: 52, modeCount: 2,
  },
  Polymer: {
    ...common, wavelengthUm: 1.55, widthUm: 2, heightUm: 1.2, slabHeightUm: 0.5,
    slotGapUm: 0.25, coreIndex: 1.59, claddingIndex: 1.49,
    substrateIndex: 1.49, paddingUm: 2, gridResolution: 44, modeCount: 3,
  },
};

const initialConfig = presets["Silicon nitride"];
const initialSweep: SweepSettings = { startWavelengthUm: 1.45, stopWavelengthUm: 1.65, points: 9, modeIndex: 0 };
const initialGeometrySweep: GeometrySweepSettings = { parameter: "widthUm", startValueUm: 0.7, stopValueUm: 1.3, points: 7, modeIndex: 0 };
const fieldComponents: FieldComponent[] = ["Ex", "Ey", "Ez", "Hx", "Hy", "Hz", "intensity", "poynting"];
const fieldLabels: Record<FieldComponent, ReactNode> = {
  Ex: <>E<sub>x</sub></>, Ey: <>E<sub>y</sub></>, Ez: <>E<sub>z</sub></>,
  Hx: <>H<sub>x</sub></>, Hy: <>H<sub>y</sub></>, Hz: <>H<sub>z</sub></>, intensity: "|E|²", poynting: <>S<sub>z</sub></>,
};

export function App() {
  const [draft, setDraft] = useState<WaveguideConfig>(initialConfig);
  const [config, setConfig] = useState<WaveguideConfig>(initialConfig);
  const [result, setResult] = useState<SolverResult>();
  const [selectedMode, setSelectedMode] = useState(0);
  const [component, setComponent] = useState<FieldComponent>("Ex");
  const [sweepSettings, setSweepSettings] = useState(initialSweep);
  const [sweepResult, setSweepResult] = useState<SweepResult>();
  const [geometrySweep, setGeometrySweep] = useState(initialGeometrySweep);
  const [geometrySweepResult, setGeometrySweepResult] = useState<GeometrySweepResult>();
  const [message, setMessage] = useState("Solving the default full-vector mode…");
  const [sweepMessage, setSweepMessage] = useState("Choose a wavelength range to calculate dispersion.");
  const [geometrySweepMessage, setGeometrySweepMessage] = useState("Sweep a device dimension while tracking the selected mode.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const initialized = useRef(false);
  const mode = result ? (result.modes[selectedMode] ?? result.modes[0]) : undefined;
  const validation = useMemo(() => mode && result ? [
    { label: "Guided solution", pass: mode.effectiveIndex > config.claddingIndex },
    { label: "Eigenpair residual", pass: mode.residual < 2e-3 },
    { label: "Core sampled", pass: Math.min(
      result.xUm.filter((x) => Math.abs(x) <= config.widthUm / 2).length,
      result.yUm.filter((y) => Math.abs(y) <= config.heightUm / 2).length,
    ) >= 8 },
  ] : [], [config, mode, result]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void runSolverWorker<SolverResult>({ kind: "solve", config: initialConfig })
      .then((initialResult) => {
        setResult(initialResult);
        setMessage(`${initialResult.modes.length} guided mode${initialResult.modes.length === 1 ? "" : "s"} found on a ${initialResult.nx} × ${initialResult.ny} Yee grid.`);
      })
      .catch((caught) => { setError(caught instanceof Error ? caught.message : "The initial mode solve failed."); setMessage("Solve failed."); })
      .finally(() => setBusy(false));
  }, []);

  function updateNumber(key: keyof WaveguideConfig, value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (preset) setDraft({ ...preset });
  }

  function updateMaterial(materialKey: "coreMaterial" | "claddingMaterial" | "substrateMaterial", indexKey: "coreIndex" | "claddingIndex" | "substrateIndex", materialId: MaterialId) {
    setDraft((current) => ({ ...current, [materialKey]: materialId, [indexKey]: displayMaterialIndex(materialId, current.wavelengthUm, current[indexKey] ?? current.claddingIndex) }));
  }

  async function solve(event: FormEvent) {
    event.preventDefault();
    const errors = validateWaveguide(draft);
    if (errors.length > 0) { setError(errors.join(" ")); return; }
    setError("");
    setBusy(true);
    setMessage("Solving the vector eigenproblem…");
    try {
        const next = await runSolverWorker<SolverResult>({ kind: "solve", config: draft });
        setConfig({ ...draft });
        setResult(next);
        setSelectedMode(0);
        setSweepResult(undefined);
        setGeometrySweepResult(undefined);
        setGeometrySweep((current) => (
          (current.parameter === "slotGapUm" && (draft.geometry ?? "channel") !== "slot")
          || (current.parameter === "couplerGapUm" && (draft.geometry ?? "channel") !== "coupler")
            ? { ...current, parameter: "widthUm" } : current
        ));
        setMessage(`${next.modes.length} guided mode${next.modes.length === 1 ? "" : "s"} found on a ${next.nx} × ${next.ny} Yee grid.`);
    } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The mode solve failed.");
        setMessage("Solve failed.");
    } finally { setBusy(false); }
  }

  async function runSweep(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSweepMessage("Tracking the mode across wavelength…");
    try {
        const next = await runSolverWorker<SweepResult>({ kind: "wavelengthSweep", config, settings: { ...sweepSettings, modeIndex: selectedMode } });
        setSweepResult(next);
        setSweepMessage(`${next.points.length} wavelengths solved with field-overlap mode tracking.`);
    } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The wavelength sweep failed.");
        setSweepMessage("Sweep failed.");
    } finally { setBusy(false); }
  }

  async function runGeometrySweep(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setGeometrySweepMessage("Tracking the mode across geometry…");
    try {
      const next = await runSolverWorker<GeometrySweepResult>({ kind: "geometrySweep", config, settings: { ...geometrySweep, modeIndex: selectedMode } });
      setGeometrySweepResult(next);
      setGeometrySweepMessage(`${next.points.length} geometries solved with resampled field-overlap tracking.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The geometry sweep failed.");
      setGeometrySweepMessage("Geometry sweep failed.");
    } finally { setBusy(false); }
  }

  function exportField() {
    if (!mode || !result) return;
    const rows = ["x_um,y_um,Ex_V_m,Ey_V_m,Ez_V_m,Hx_A_m,Hy_A_m,Hz_A_m,E2_V2_m2,Sz_W_m2"];
    for (let row = 0; row < result.yUm.length; row += 1) {
      for (let column = 0; column < result.xUm.length; column += 1) {
        rows.push([result.xUm[column], result.yUm[row], mode.fields.Ex[row][column], mode.fields.Ey[row][column],
          mode.fields.Ez[row][column], mode.fields.Hx[row][column], mode.fields.Hy[row][column],
          mode.fields.Hz[row][column], mode.fields.intensity[row][column], mode.fields.poynting[row][column]].join(","));
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

  function exportGeometrySweep() {
    if (!geometrySweepResult) return;
    const rows = ["value_um,n_eff,confinement,effective_area_um2,loss_db_cm,mode_overlap",
      ...geometrySweepResult.points.map((point) => [point.valueUm, point.effectiveIndex, point.electricConfinement,
        point.effectiveAreaUm2, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), `waveguide-${geometrySweepResult.parameter}-sweep.csv`);
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
        <p>Model, validate and explore channel, rib, slot, coupler and multilayer waveguides with dispersive materials, fabrication tolerances and coupling analysis.</p>
      </section>

      <div className="workspace">
        <aside className="control-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Waveguide</h2></div><span className="method-chip">FDM</span></div>
          <form onSubmit={solve} noValidate>
            <label>Platform preset<select defaultValue="Silicon nitride" onChange={(event) => applyPreset(event.target.value)}>{Object.keys(presets).map((name) => <option key={name}>{name}</option>)}</select></label>
            <label className="select-field">Geometry<select value={draft.geometry ?? "channel"} onChange={(event) => setDraft((current) => ({ ...current, geometry: event.target.value as GeometryType }))}>
              <option value="channel">Channel</option><option value="rib">Rib</option><option value="slot">Slot</option><option value="coupler">Two-guide coupler</option><option value="multilayer">Multilayer ridge</option>
            </select></label>
            <div className="material-selectors">
              <MaterialSelect label="Core material" value={draft.coreMaterial ?? "custom"} onChange={(value) => updateMaterial("coreMaterial", "coreIndex", value)} />
              <MaterialSelect label="Cladding material" value={draft.claddingMaterial ?? "custom"} onChange={(value) => updateMaterial("claddingMaterial", "claddingIndex", value)} />
              {(draft.geometry ?? "channel") === "multilayer" && <MaterialSelect label="Substrate material" value={draft.substrateMaterial ?? "custom"} onChange={(value) => updateMaterial("substrateMaterial", "substrateIndex", value)} />}
            </div>
            <div className="form-grid">
              <NumberField label="Wavelength" unit="µm" value={draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("wavelengthUm", v)} />
              <NumberField label={(draft.geometry ?? "channel") === "coupler" ? "Guide width" : "Core width"} unit="µm" value={draft.widthUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("widthUm", v)} />
              <NumberField label="Core height" unit="µm" value={draft.heightUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("heightUm", v)} />
              <NumberField label="Padding" unit="µm" value={draft.paddingUm} min={0.2} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.1} onChange={(v) => updateNumber("paddingUm", v)} />
              {(draft.geometry ?? "channel") === "rib" && <NumberField label="Slab height" unit="µm" value={draft.slabHeightUm ?? 0.15} min={0.01} max={Number.isFinite(draft.heightUm) ? draft.heightUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slabHeightUm", v)} />}
              {(draft.geometry ?? "channel") === "slot" && <NumberField label="Slot gap" unit="µm" value={draft.slotGapUm ?? 0.12} min={0.01} max={Number.isFinite(draft.widthUm) ? draft.widthUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slotGapUm", v)} />}
              {(draft.geometry ?? "channel") === "coupler" && <NumberField label="Coupler gap" unit="µm" value={draft.couplerGapUm ?? 0.2} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("couplerGapUm", v)} />}
              {(draft.geometry ?? "channel") === "multilayer" && <NumberField label="Substrate n" unit="n" value={draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("substrateIndex", v)} />}
              <NumberField label="Core nₓ" unit="n" value={displayMaterialIndex(draft.coreMaterial, draft.wavelengthUm, draft.coreIndex)} min={1.01} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndex", v)} />
              <NumberField label="Cladding nₓ" unit="n" value={displayMaterialIndex(draft.claddingMaterial, draft.wavelengthUm, draft.claddingIndex)} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndex", v)} />
              <NumberField label="Resolution" unit="cells" value={draft.gridResolution} min={24} max={PARAMETER_MAXIMUMS.gridResolution} step={1} onChange={(v) => updateNumber("gridResolution", v)} />
              <NumberField label="Modes" unit="modes" value={draft.modeCount} min={1} max={PARAMETER_MAXIMUMS.modeCount} step={1} onChange={(v) => updateNumber("modeCount", v)} />
            </div>
            <details className="advanced-controls">
              <summary>Materials & mesh</summary>
              <div className="form-grid">
                <NumberField label="Core nᵧ" unit="n" value={(draft.coreMaterial ?? "custom") === "custom" ? (draft.coreIndexY ?? draft.coreIndex) : displayMaterialIndex(draft.coreMaterial, draft.wavelengthUm, draft.coreIndex)} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndexY", v)} />
                <NumberField label={<>Core n<sub>z</sub></>} unit="n" value={(draft.coreMaterial ?? "custom") === "custom" ? (draft.coreIndexZ ?? draft.coreIndex) : displayMaterialIndex(draft.coreMaterial, draft.wavelengthUm, draft.coreIndex)} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndexZ", v)} />
                <NumberField label="Cladding nᵧ" unit="n" value={(draft.claddingMaterial ?? "custom") === "custom" ? (draft.claddingIndexY ?? draft.claddingIndex) : displayMaterialIndex(draft.claddingMaterial, draft.wavelengthUm, draft.claddingIndex)} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndexY", v)} />
                <NumberField label={<>Cladding n<sub>z</sub></>} unit="n" value={(draft.claddingMaterial ?? "custom") === "custom" ? (draft.claddingIndexZ ?? draft.claddingIndex) : displayMaterialIndex(draft.claddingMaterial, draft.wavelengthUm, draft.claddingIndex)} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndexZ", v)} />
                <NumberField label="Core κ" unit="Im(n)" value={draft.coreExtinction ?? 0} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} onChange={(v) => updateNumber("coreExtinction", v)} />
                <NumberField label="Cladding κ" unit="Im(n)" value={draft.claddingExtinction ?? 0} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} onChange={(v) => updateNumber("claddingExtinction", v)} />
                <NumberField label="Core dn/dλ" unit="µm⁻¹" value={draft.coreDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreDispersionPerUm", v)} />
                <NumberField label="Clad. dn/dλ" unit="µm⁻¹" value={draft.claddingDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingDispersionPerUm", v)} />
                {(draft.geometry ?? "channel") === "multilayer" && <>
                  <NumberField label="Substrate nᵧ" unit="n" value={draft.substrateIndexY ?? draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("substrateIndexY", v)} />
                  <NumberField label={<>Substrate n<sub>z</sub></>} unit="n" value={draft.substrateIndexZ ?? draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} onChange={(v) => updateNumber("substrateIndexZ", v)} />
                  <NumberField label="Substrate κ" unit="Im(n)" value={draft.substrateExtinction ?? 0} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} onChange={(v) => updateNumber("substrateExtinction", v)} />
                  <NumberField label="Substrate dn/dλ" unit="µm⁻¹" value={draft.substrateDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} onChange={(v) => updateNumber("substrateDispersionPerUm", v)} />
                </>}
                <NumberField label="Reference λ" unit="µm" value={draft.materialReferenceWavelengthUm ?? draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("materialReferenceWavelengthUm", v)} />
                <NumberField label="Mesh bias" unit={`0–${PARAMETER_MAXIMUMS.meshBias}`} value={draft.meshBias ?? 0} min={0} max={PARAMETER_MAXIMUMS.meshBias} step={0.1} onChange={(v) => updateNumber("meshBias", v)} />
                <label className="select-field">Outer boundary<select value={draft.boundary ?? "hard"} onChange={(event) => setDraft((current) => ({ ...current, boundary: event.target.value as "hard" | "pml" }))}><option value="hard">Hard wall</option><option value="pml">PML (open)</option></select></label>
                {(draft.boundary ?? "hard") === "pml" && <>
                  <NumberField label="PML thickness" unit="µm" value={draft.pmlThicknessUm ?? draft.paddingUm * 0.6} min={0.01} max={Math.max(0.02, draft.paddingUm - 0.01)} step={0.05} onChange={(v) => updateNumber("pmlThicknessUm", v)} />
                  <NumberField label="PML strength" unit="σ" value={draft.pmlStrength ?? 4} min={0.1} max={50} step={0.5} onChange={(v) => updateNumber("pmlStrength", v)} />
                </>}
              </div>
              <MaterialSources config={draft} />
              <p>Diagonal complex tensor ε = diag[(nₓ + iκ)², (nᵧ + iκ)², (n_z + iκ)²]. The PML uses cubic complex-coordinate stretching; dn/dλ is linear around the reference wavelength.</p>
            </details>
            <button className="solve-button" type="submit" disabled={busy}>Solve modes <span aria-hidden="true">→</span></button>
            <p className="status" aria-live="polite">{message}</p>{error && <p className="error" role="alert">{error}</p>}
          </form>
        </aside>

        <section className="results-panel" aria-labelledby="results-title">
          <div className="panel-heading results-heading"><div><span className="step">02</span><h2 id="results-title">Mode explorer</h2></div><button className="export-button" type="button" onClick={exportField} disabled={!mode}>Export CSV</button></div>
          {mode && result ? <>
            <div className="mode-tabs" role="tablist" aria-label="Guided modes">{result.modes.map((item, index) => <button type="button" role="tab" aria-selected={selectedMode === index} className={selectedMode === index ? "active" : ""} key={`${item.id}-${index}`} onClick={() => setSelectedMode(index)}><span>{item.polarization}</span><small><i>n</i><sub>eff</sub> {item.effectiveIndex.toFixed(5)}</small></button>)}</div>
            <div className="metrics">
              <Metric label={<>Effective index <i>n</i><sub>eff</sub></>} value={mode.effectiveIndex.toFixed(6)} />
              <Metric label={<>Propagation constant β</>} value={`${mode.propagationConstantPerUm.toFixed(4)} µm⁻¹`} />
              <Metric label="Electric confinement" value={`${(mode.electricConfinement * 100).toFixed(1)}%`} />
              <Metric label={<>Effective area <i>A</i><sub>eff</sub></>} value={`${mode.effectiveAreaUm2.toFixed(3)} µm²`} />
              <Metric label="Total attenuation" value={`${mode.lossDbPerCm.toPrecision(3)} dB/cm`} />
              <Metric label={<>Imaginary index Im(<i>n</i><sub>eff</sub>)</>} value={mode.effectiveIndexImaginary.toExponential(3)} />
              <Metric label="Normalized power" value={`${mode.modalPowerW.toFixed(3)} W`} />
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

      <section className="sweep-section">
        <div className="panel-heading"><div><span className="step">04</span><h2>Geometry sweep</h2></div><button className="export-button" type="button" disabled={!geometrySweepResult} onClick={exportGeometrySweep}>Export CSV</button></div>
        <form className="sweep-controls" onSubmit={runGeometrySweep}>
          <label className="select-field">Parameter<select value={geometrySweep.parameter} onChange={(event) => setGeometrySweep((current) => ({ ...current, parameter: event.target.value as GeometrySweepParameter }))}>
            <option value="widthUm">Core width</option><option value="heightUm">Core height</option>{(config.geometry ?? "channel") === "slot" && <option value="slotGapUm">Slot gap</option>}
            {(config.geometry ?? "channel") === "coupler" && <option value="couplerGapUm">Coupler gap</option>}
          </select></label>
          <NumberField label="Start value" unit="µm" value={geometrySweep.startValueUm} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(value) => setGeometrySweep((current) => ({ ...current, startValueUm: value }))} />
          <NumberField label="Stop value" unit="µm" value={geometrySweep.stopValueUm} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(value) => setGeometrySweep((current) => ({ ...current, stopValueUm: value }))} />
          <NumberField label="Samples" unit="points" value={geometrySweep.points} min={3} max={PARAMETER_MAXIMUMS.sweepPoints} step={1} onChange={(value) => setGeometrySweep((current) => ({ ...current, points: value }))} />
          <button className="solve-button" type="submit" disabled={busy || !mode}>Run sweep <span aria-hidden="true">→</span></button>
        </form>
        <p className="status" aria-live="polite">{geometrySweepMessage}</p>
        {geometrySweepResult && <><GeometrySweepPlot result={geometrySweepResult} />{geometrySweepResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</>}
      </section>

      <AdvancedAnalyses key={JSON.stringify(config)} config={config} result={result} selectedMode={selectedMode} />

      <section className="validation-section">
        <div className="method-card"><p className="eyebrow">Numerical model</p><h2>Full-vector finite-difference eigenmode method</h2><p>The solver discretizes Maxwell’s equations on a transverse Yee grid and solves the coupled eigenproblem for <i>H</i><sub>x</sub> and <i>H</i><sub>y</sub>. Subpixel material averaging and nonuniform differences improve interface and mesh convergence.</p><div className="equation"><span>U</span><b>H</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>H</b><sub>t</sub></div><p className="limitation">Scope: linear, non-magnetic dielectrics with diagonal anisotropy. Use the stretched-coordinate PML and repeat padding, PML and mesh sweeps before interpreting leakage or material attenuation quantitatively.</p></div>
        <div className="checks-card"><p className="eyebrow">Current solution</p><h2>Validation checks</h2><div className="checks">{validation.map((check) => <div key={check.label}><span className={check.pass ? "pass" : "warn"}>{check.pass ? "Pass" : "Review"}</span><strong>{check.label}</strong></div>)}</div>{mode && result && <dl className="solver-details"><div><dt>Relative residual</dt><dd>{mode.residual.toExponential(2)}</dd></div><div><dt>Grid spacing range</dt><dd>{result.dxUm.toFixed(3)}–{result.dxMaxUm.toFixed(3)} µm</dd></div><div><dt>Longitudinal E fraction</dt><dd>{(mode.longitudinalElectricFraction * 100).toFixed(2)}%</dd></div><div><dt>Eₓ transverse fraction</dt><dd>{(mode.xPolarizedElectricFraction * 100).toFixed(2)}%</dd></div></dl>}{result?.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</div>
      </section>
    </main>
    <footer><span>Waveguide Mode Solver</span><span>Built for photonics education · Check mesh, boundary and sweep convergence before design use.</span></footer>
  </div>;
}

function NumberField({ label, unit, value, min, max, step, disabled = false, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(parseNumericInput(event.target.value))} /><small>{unit}</small></div></label>;
}

function MaterialSelect({ label, value, onChange }: { label: string; value: MaterialId; onChange: (value: MaterialId) => void }) {
  return <label className="select-field">{label}<select value={value} onChange={(event) => onChange(event.target.value as MaterialId)}>{MATERIALS.map((material) => <option value={material.id} key={material.id}>{material.name}</option>)}</select></label>;
}

function MaterialSources({ config }: { config: WaveguideConfig }) {
  const selected = [...new Set([config.coreMaterial, config.claddingMaterial, config.substrateMaterial])]
    .filter((id): id is MaterialId => Boolean(id && id !== "custom"))
    .map(materialDefinition);
  if (selected.length === 0) return null;
  return <p className="material-sources">Models: {selected.map((material, index) => <span key={material.id}>{index > 0 && " · "}{material.sourceUrl ? <a href={material.sourceUrl} target="_blank" rel="noreferrer">{material.sourceLabel}</a> : material.name} ({material.minimumWavelengthUm}–{material.maximumWavelengthUm} µm)</span>)}</p>;
}

function displayMaterialIndex(materialId: MaterialId | undefined, wavelengthUm: number, fallback: number): number {
  if (!materialId || materialId === "custom") return fallback;
  try { return evaluateMaterial(materialId, wavelengthUm); } catch { return fallback; }
}

function Metric({ label, value }: { label: ReactNode; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
