import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ModePlot } from "./ModePlot";
import { GeometryPlot } from "./GeometryPlot";
import { SweepPlot } from "./SweepPlot";
import { GeometrySweepPlot } from "./GeometrySweepPlot";
import { parseNumericInput } from "./numericInput";
import { runSolverWorker } from "./workerClient";
import { AdvancedAnalyses } from "./AdvancedAnalyses";
import packageJson from "../package.json";
import {
  MATERIALS, evaluateMaterialAxes, evaluateMaterialPrincipalIndices, evaluateTabulatedMaterial, materialDefinition,
  opticAxisDirection, parseMaterialCsv, uniaxialPermittivityTensor,
  type MaterialId, type OpticAxis, type TabulatedMaterialData,
} from "./materials";
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
  type VerticalLayer,
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
  sidewallAngleDeg: 90,
  materialTemperatureC: 21,
  coreOpticAxis: "y" as OpticAxis,
  coreElectricFieldVPerUm: 0,
  bendRadiusUm: 0,
  bendDirection: "positive-x" as const,
};

const STANDARD_GRID_RESOLUTION = 96;
const THIN_FILM_GRID_RESOLUTION = 128;

const presets: Record<string, WaveguideConfig> = {
  "SiN · channel": {
    ...common, wavelengthUm: 1.55, widthUm: 1, heightUm: 0.4, coreIndex: 2,
    claddingIndex: 1.444, substrateIndex: 1.444, coreMaterial: "silicon-nitride", claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 1.2, gridResolution: STANDARD_GRID_RESOLUTION, modeCount: 3,
  },
  "SOI · strip": {
    ...common, wavelengthUm: 1.55, widthUm: 0.45, heightUm: 0.22, slabHeightUm: 0.09,
    slotGapUm: 0.08, coreIndex: 3.476, claddingIndex: 1.444,
    substrateIndex: 1.444, coreMaterial: "silicon", claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 0.8, gridResolution: THIN_FILM_GRID_RESOLUTION, modeCount: 2,
  },
  "SOI · rib": {
    ...common, geometry: "rib", wavelengthUm: 1.55, widthUm: 0.5, heightUm: 0.22, slabHeightUm: 0.09,
    coreIndex: 3.476, claddingIndex: 1.444, substrateIndex: 1.444, coreMaterial: "silicon",
    claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 0.8, gridResolution: THIN_FILM_GRID_RESOLUTION, modeCount: 3,
  },
  "SOI · slot": {
    ...common, geometry: "slot", wavelengthUm: 1.55, widthUm: 0.52, heightUm: 0.22, slotGapUm: 0.08,
    coreIndex: 3.476, claddingIndex: 1.444, substrateIndex: 1.444, coreMaterial: "silicon",
    claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 0.8, gridResolution: THIN_FILM_GRID_RESOLUTION, modeCount: 3,
  },
  "TFLN · Z-cut rib": {
    ...common, geometry: "rib", wavelengthUm: 1.55, widthUm: 1.2, heightUm: 0.6, slabHeightUm: 0.3,
    sidewallAngleDeg: 70, coreIndex: 2.211, coreIndexY: 2.138, coreIndexZ: 2.211, coreMaterial: "lithium-niobate", coreOpticAxis: "y",
    claddingIndex: 1.444, substrateIndex: 1.444, claddingMaterial: "silica", substrateMaterial: "silica",
    paddingUm: 1.5, gridResolution: STANDARD_GRID_RESOLUTION, modeCount: 3,
  },
  "AlN · channel": {
    ...common, wavelengthUm: 1.55, widthUm: 0.8, heightUm: 0.4, coreIndex: 2.15, coreMaterial: "aluminum-nitride",
    coreOpticAxis: "y", claddingIndex: 1.444, substrateIndex: 1.444, claddingMaterial: "silica", substrateMaterial: "silica",
    paddingUm: 1.2, gridResolution: STANDARD_GRID_RESOLUTION, modeCount: 3,
  },
  "4H-SiCOI · channel": {
    ...common, wavelengthUm: 1.55, widthUm: 0.8, heightUm: 0.4, coreIndex: 2.56, coreMaterial: "silicon-carbide",
    coreOpticAxis: "y", claddingIndex: 1.444, substrateIndex: 1.444, claddingMaterial: "silica", substrateMaterial: "silica",
    paddingUm: 1.2, gridResolution: STANDARD_GRID_RESOLUTION, modeCount: 3,
  },
  "Silica · weak guidance": {
    ...common, wavelengthUm: 1.55, widthUm: 4, heightUm: 4, coreIndex: 1.46, claddingIndex: 1.444,
    substrateIndex: 1.444, claddingMaterial: "silica", substrateMaterial: "silica", paddingUm: 5,
    gridResolution: STANDARD_GRID_RESOLUTION, modeCount: 3,
  },
  "Polymer · channel": {
    ...common, wavelengthUm: 1.55, widthUm: 2, heightUm: 1.2, slabHeightUm: 0.5,
    slotGapUm: 0.25, coreIndex: 1.59, claddingIndex: 1.49,
    substrateIndex: 1.49, paddingUm: 2, gridResolution: STANDARD_GRID_RESOLUTION, modeCount: 3,
  },
};

const initialConfig = presets["SiN · channel"];
const initialSweep: SweepSettings = { startWavelengthUm: 1.45, stopWavelengthUm: 1.65, points: 9, modeIndex: 0 };
const initialGeometrySweep: GeometrySweepSettings = { parameter: "widthUm", startValueUm: 0.7, stopValueUm: 1.3, points: 7, modeIndex: 0 };
const fieldComponents: FieldComponent[] = ["Ex", "Ey", "Ez", "Hx", "Hy", "Hz", "intensity", "poynting"];
const fieldLabels: Record<FieldComponent, ReactNode> = {
  Ex: <>E<sub>x</sub></>, Ey: <>E<sub>y</sub></>, Ez: <>E<sub>z</sub></>,
  Hx: <>H<sub>x</sub></>, Hy: <>H<sub>y</sub></>, Hz: <>H<sub>z</sub></>, intensity: "|E|²", poynting: <>S<sub>z</sub></>,
};
type AppView = "solver" | "sweeps" | "analysis" | "validation";
const appViews: Array<{ id: AppView; label: string }> = [
  { id: "solver", label: "Mode Solver" },
  { id: "sweeps", label: "Sweeps" },
  { id: "analysis", label: "Analysis" },
  { id: "validation", label: "Validation" },
];

function viewFromHash(): AppView {
  const hash = window.location.hash.slice(1);
  return appViews.some((view) => view.id === hash) ? hash as AppView : "solver";
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(() => typeof window === "undefined" ? "solver" : viewFromHash());
  const [solverPane, setSolverPane] = useState<"configure" | "results">("configure");
  const [draft, setDraft] = useState<WaveguideConfig>(initialConfig);
  const [config, setConfig] = useState<WaveguideConfig>(initialConfig);
  const [result, setResult] = useState<SolverResult>();
  const [selectedMode, setSelectedMode] = useState(0);
  const [component, setComponent] = useState<FieldComponent>("Ex");
  const [resultView, setResultView] = useState<"mode" | "geometry">("mode");
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
    { label: "Guided solution", pass: mode.guidanceMargin > 0 && !mode.nearCutoff },
    { label: "Eigenpair residual", pass: mode.residual < 2e-3 },
    { label: "Core sampled", pass: Math.min(
      result.xUm.filter((x) => Math.abs(x) <= config.widthUm / 2).length,
      result.yUm.filter((y) => Math.abs(y) <= config.heightUm / 2).length,
    ) >= 8 },
    ...((config.bendRadiusUm ?? 0) > 0 ? [{ label: "Open radial boundary", pass: (config.boundary ?? "hard") === "pml" }] : []),
  ] : [], [config, mode, result]);
  const geometrySweepMaximum = geometrySweep.parameter === "bendRadiusUm" ? PARAMETER_MAXIMUMS.bendRadiusUm : PARAMETER_MAXIMUMS.dimensionUm;

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

  useEffect(() => {
    const syncView = () => setActiveView(viewFromHash());
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, solverPane]);

  function navigateToView(view: AppView) {
    window.history.pushState(null, "", `#${view}`);
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateNumber(key: keyof WaveguideConfig, value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (preset) setDraft({ ...preset });
  }

  function updateMaterial(materialKey: "coreMaterial" | "claddingMaterial" | "substrateMaterial", indexKey: "coreIndex" | "claddingIndex" | "substrateIndex", materialId: MaterialId) {
    setDraft((current) => ({
      ...current,
      [materialKey]: materialId,
      [indexKey]: displayMaterialIndex(materialId, current.wavelengthUm, current[indexKey] ?? current.claddingIndex, current.materialTemperatureC, materialKey === "coreMaterial" ? current.coreOpticAxis : materialKey === "claddingMaterial" ? current.claddingOpticAxis : current.substrateOpticAxis, materialKey === "coreMaterial" ? current.coreElectricFieldVPerUm : 0, materialKey === "coreMaterial" ? current.coreMaterialTable : materialKey === "claddingMaterial" ? current.claddingMaterialTable : current.substrateMaterialTable),
    }));
  }

  async function importMaterialCsv(region: "core" | "cladding" | "substrate", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const table = parseMaterialCsv(await file.text(), file.name);
      const sample = evaluateTabulatedMaterial(table, draft.wavelengthUm);
      setDraft((current) => region === "core"
        ? { ...current, coreMaterial: "tabulated", coreMaterialTable: table, coreIndex: sample.n, coreExtinction: sample.k }
        : region === "cladding"
          ? { ...current, claddingMaterial: "tabulated", claddingMaterialTable: table, claddingIndex: sample.n, claddingExtinction: sample.k }
          : { ...current, substrateMaterial: "tabulated", substrateMaterialTable: table, substrateIndex: sample.n, substrateExtinction: sample.k });
      setError("");
      setMessage(`${table.name} imported at ${table.wavelengthUm.length} wavelengths. Solve to apply it.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The material CSV could not be imported.");
    }
  }

  function updateStackLayer(index: number, update: Partial<VerticalLayer>) {
    setDraft((current) => ({ ...current, stackLayers: (current.stackLayers ?? []).map((layer, layerIndex) => layerIndex === index ? { ...layer, ...update } : layer) }));
  }

  function addStackLayer() {
    setDraft((current) => ({ ...current, stackLayers: [...(current.stackLayers ?? []), { name: `Layer ${(current.stackLayers?.length ?? 0) + 1}`, thicknessUm: 0.5, material: "silica", index: 1.444 }] }));
  }

  function removeStackLayer(index: number) {
    setDraft((current) => ({ ...current, stackLayers: (current.stackLayers ?? []).filter((_, layerIndex) => layerIndex !== index) }));
  }

  async function solve(event: FormEvent) {
    event.preventDefault();
    const errors = validateWaveguide(draft);
    if (errors.length > 0) { setError(errors.join(" ")); return; }
    setError("");
    setBusy(true);
    setMessage((draft.bendRadiusUm ?? 0) > 0
      ? `Solving a ${draft.gridResolution}-cell bent-waveguide eigenproblem with PML; fine meshes or several modes can take longer…`
      : draft.gridResolution > 96
        ? `Solving a high-resolution ${draft.gridResolution}-cell eigenproblem; this can take tens of seconds…`
        : "Solving the vector eigenproblem…");
    try {
        const next = await runSolverWorker<SolverResult>({ kind: "solve", config: draft });
        setConfig({ ...draft });
        setResult(next);
        setSelectedMode(0);
        setSweepResult(undefined);
        setGeometrySweepResult(undefined);
        setSolverPane("results");
        setGeometrySweep((current) => (
          (current.parameter === "slotGapUm" && (draft.geometry ?? "channel") !== "slot")
          || (current.parameter === "couplerGapUm" && (draft.geometry ?? "channel") !== "coupler")
          || (current.parameter === "bendRadiusUm" && (draft.bendRadiusUm ?? 0) <= 0)
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
    const rows = ["wavelength_um,mode_label,near_cutoff,n_eff,n_group,dispersion_ps_nm_km,beta2_ps2_km,loss_db_cm,mode_overlap",
      ...sweepResult.points.map((point) => [point.wavelengthUm, point.modeLabel, point.nearCutoff, point.effectiveIndex,
        point.groupIndex, point.dispersionPsPerNmKm, point.beta2Ps2PerKm, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), "waveguide-dispersion.csv");
  }

  function exportGeometrySweep() {
    if (!geometrySweepResult) return;
    const rows = ["value_um,mode_label,near_cutoff,n_eff,confinement,effective_area_um2,loss_db_cm,mode_overlap",
      ...geometrySweepResult.points.map((point) => [point.valueUm, point.modeLabel, point.nearCutoff, point.effectiveIndex, point.electricConfinement,
        point.effectiveAreaUm2, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), `waveguide-${geometrySweepResult.parameter}-sweep.csv`);
  }

  function exportProject() {
    const project = {
      schemaVersion: 1,
      solverVersion: packageJson.version,
      exportedAt: new Date().toISOString(),
      config,
      result,
      wavelengthSweep: sweepResult,
      geometrySweep: geometrySweepResult,
    };
    download(JSON.stringify(project, null, 2), `waveguide-project-v${packageJson.version}.json`, "application/json;charset=utf-8");
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as { schemaVersion?: number; config?: WaveguideConfig };
      if (project.schemaVersion !== 1 || !project.config) throw new Error("Unsupported project file.");
      const errors = validateWaveguide(project.config);
      if (errors.length > 0) throw new Error(errors.join(" "));
      setDraft(project.config);
      setError("");
      setMessage("Configuration imported. Solve to regenerate trusted results.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project file could not be imported.");
    }
  }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="./" aria-label="Waveguide Mode Solver home">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Waveguide Mode Solver</span>
      </a>
      <div className="header-meta"><span>v{packageJson.version} · Full-vector FDM</span><a href="https://github.com/jorpago2/waveguide-mode-solver" target="_blank" rel="noreferrer">GitHub</a></div>
    </header>
    <nav className="app-nav" aria-label="Solver sections">
      <div>{appViews.map((view) => <a href={`#${view.id}`} aria-current={activeView === view.id ? "page" : undefined} className={activeView === view.id ? "active" : ""} key={view.id} onClick={(event) => { event.preventDefault(); navigateToView(view.id); }}>{view.label}</a>)}</div>
    </nav>

    <main>
      <section className="app-view" id="solver" hidden={activeView !== "solver"} aria-labelledby="page-title">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Integrated photonics · educational solver</p>
        <h1 id="page-title">Solve and inspect complete vector modes.</h1>
        <p>Configure straight or curved waveguides, solve their guided modes and inspect the fields, structure and mesh in one focused workspace.</p>
        <div className="project-actions"><button type="button" className="export-button" onClick={exportProject}>Export project JSON</button><label className="export-button">Import configuration<input type="file" accept="application/json,.json" onChange={importProject} /></label></div>
      </section>

      <div className="mobile-pane-tabs" role="tablist" aria-label="Mode solver workspace">
        <button type="button" role="tab" aria-selected={solverPane === "configure"} aria-controls="configuration-panel" className={solverPane === "configure" ? "active" : ""} onClick={() => setSolverPane("configure")}>Configure</button>
        <button type="button" role="tab" aria-selected={solverPane === "results"} aria-controls="results-panel" className={solverPane === "results" ? "active" : ""} onClick={() => setSolverPane("results")}>Results</button>
      </div>
      <div className="workspace" data-mobile-pane={solverPane}>
        <aside className="control-panel" id="configuration-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Waveguide</h2></div><span className="method-chip">FDM</span></div>
          <form onSubmit={solve} noValidate>
            <label>Platform preset<select defaultValue="SiN · channel" onChange={(event) => applyPreset(event.target.value)}>{Object.keys(presets).map((name) => <option key={name}>{name}</option>)}</select></label>
            <label className="select-field">Geometry<select value={draft.geometry ?? "channel"} onChange={(event) => setDraft((current) => ({ ...current, geometry: event.target.value as GeometryType }))}>
              <option value="channel">Channel</option><option value="rib">Rib</option><option value="slot">Slot</option><option value="coupler">Two-guide coupler</option><option value="multilayer">Multilayer ridge</option>
            </select></label>
            <div className="material-selectors">
              <MaterialSelect label="Core material" value={draft.coreMaterial ?? "custom"} onChange={(value) => updateMaterial("coreMaterial", "coreIndex", value)} />
              <MaterialSelect label="Cladding material" value={draft.claddingMaterial ?? "custom"} onChange={(value) => updateMaterial("claddingMaterial", "claddingIndex", value)} />
              {((draft.geometry ?? "channel") === "multilayer" || (draft.stackLayers?.length ?? 0) > 0) && <MaterialSelect label="Base substrate" value={draft.substrateMaterial ?? "custom"} onChange={(value) => updateMaterial("substrateMaterial", "substrateIndex", value)} />}
            </div>
            <div className="form-grid">
              <NumberField label="Wavelength" unit="µm" value={draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("wavelengthUm", v)} />
              <NumberField label={(draft.geometry ?? "channel") === "coupler" ? "Guide width" : "Core width"} unit="µm" value={draft.widthUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("widthUm", v)} />
              <NumberField label="Core height" unit="µm" value={draft.heightUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("heightUm", v)} />
              <NumberField label="Padding" unit="µm" value={draft.paddingUm} min={0.2} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.1} onChange={(v) => updateNumber("paddingUm", v)} />
              <label className="select-field">Propagation path<select value={(draft.bendRadiusUm ?? 0) > 0 ? "bend" : "straight"} onChange={(event) => setDraft((current) => event.target.value === "bend" ? { ...current, bendRadiusUm: current.bendRadiusUm && current.bendRadiusUm > 0 ? current.bendRadiusUm : 10, boundary: "pml" } : { ...current, bendRadiusUm: 0 })}><option value="straight">Straight</option><option value="bend">Constant-radius bend</option></select></label>
              {(draft.bendRadiusUm ?? 0) > 0 && <>
                <NumberField label="Bend radius" unit="µm" value={draft.bendRadiusUm ?? 10} min={0.1} max={PARAMETER_MAXIMUMS.bendRadiusUm} step={0.5} onChange={(v) => updateNumber("bendRadiusUm", v)} />
                <label className="select-field">Bend direction<select value={draft.bendDirection ?? "positive-x"} onChange={(event) => setDraft((current) => ({ ...current, bendDirection: event.target.value as "positive-x" | "negative-x" }))}><option value="positive-x">Outer side at +x</option><option value="negative-x">Outer side at −x</option></select></label>
              </>}
              {(draft.geometry ?? "channel") === "rib" && <NumberField label="Slab height" unit="µm" value={draft.slabHeightUm ?? 0.15} min={0.01} max={Number.isFinite(draft.heightUm) ? draft.heightUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slabHeightUm", v)} />}
              {(draft.geometry ?? "channel") === "slot" && <NumberField label="Slot gap" unit="µm" value={draft.slotGapUm ?? 0.12} min={0.01} max={Number.isFinite(draft.widthUm) ? draft.widthUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slotGapUm", v)} />}
              {(draft.geometry ?? "channel") === "coupler" && <NumberField label="Coupler gap" unit="µm" value={draft.couplerGapUm ?? 0.2} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("couplerGapUm", v)} />}
              {(draft.geometry ?? "channel") !== "slot" && <NumberField label="Sidewall angle" unit="°" value={draft.sidewallAngleDeg ?? 90} min={20} max={90} step={1} onChange={(v) => updateNumber("sidewallAngleDeg", v)} />}
              {((draft.geometry ?? "channel") === "multilayer" || (draft.stackLayers?.length ?? 0) > 0) && <NumberField label="Base substrate n" unit="n" value={draft.substrateIndex ?? draft.claddingIndex} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.substrateMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("substrateIndex", v)} />}
              <NumberField label="Core nₓ" unit="n" value={displayMaterialAxis(draft, "core", "x")} min={1.01} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndex", v)} />
              <NumberField label="Cladding nₓ" unit="n" value={displayMaterialAxis(draft, "cladding", "x")} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndex", v)} />
              <NumberField label="Resolution" unit="cells" value={draft.gridResolution} min={24} max={PARAMETER_MAXIMUMS.gridResolution} step={1} onChange={(v) => updateNumber("gridResolution", v)} />
              <NumberField label="Modes" unit="modes" value={draft.modeCount} min={1} max={PARAMETER_MAXIMUMS.modeCount} step={1} onChange={(v) => updateNumber("modeCount", v)} />
            </div>
            <details className="advanced-controls">
              <summary>Vertical stack ({draft.stackLayers?.length ?? 0} layers)</summary>
              <p>Finite layers are listed from the core downward; the base substrate continues below the final layer.</p>
              <div className="stack-editor">
                {(draft.stackLayers ?? []).map((layer, index) => <div className="stack-layer" key={`${index}-${layer.name}`}>
                  <label>Layer name<input value={layer.name} onChange={(event) => updateStackLayer(index, { name: event.target.value })} /></label>
                  <MaterialSelect label="Material" value={layer.material} allowTabulated={false} onChange={(material) => updateStackLayer(index, { material, index: displayMaterialIndex(material, draft.wavelengthUm, layer.index, draft.materialTemperatureC, layer.opticAxis) })} />
                  <NumberField label="Thickness" unit="µm" value={layer.thicknessUm} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.05} onChange={(value) => updateStackLayer(index, { thicknessUm: value })} />
                  <NumberField label="Index" unit="n" value={displayMaterialIndex(layer.material, draft.wavelengthUm, layer.index, draft.materialTemperatureC, layer.opticAxis)} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={layer.material !== "custom"} onChange={(value) => updateStackLayer(index, { index: value })} />
                  <button type="button" className="remove-layer" onClick={() => removeStackLayer(index)} aria-label={`Remove ${layer.name}`}>Remove</button>
                </div>)}
              </div>
              <button type="button" className="export-button add-layer" onClick={addStackLayer} disabled={(draft.stackLayers?.length ?? 0) >= 6}>Add layer</button>
            </details>
            <details className="advanced-controls">
              <summary>Materials & mesh</summary>
              <div className="material-table-imports">
                {(draft.coreMaterial ?? "custom") === "tabulated" && <MaterialCsvInput region="Core" table={draft.coreMaterialTable} onChange={(event) => void importMaterialCsv("core", event)} />}
                {(draft.claddingMaterial ?? "custom") === "tabulated" && <MaterialCsvInput region="Cladding" table={draft.claddingMaterialTable} onChange={(event) => void importMaterialCsv("cladding", event)} />}
                {(draft.substrateMaterial ?? "custom") === "tabulated" && <MaterialCsvInput region="Substrate" table={draft.substrateMaterialTable} onChange={(event) => void importMaterialCsv("substrate", event)} />}
              </div>
              <div className="form-grid">
                <NumberField label="Core nᵧ" unit="n" value={displayMaterialAxis(draft, "core", "y")} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndexY", v)} />
                <NumberField label={<>Core n<sub>z</sub></>} unit="n" value={displayMaterialAxis(draft, "core", "z")} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndexZ", v)} />
                <NumberField label="Cladding nᵧ" unit="n" value={displayMaterialAxis(draft, "cladding", "y")} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndexY", v)} />
                <NumberField label={<>Cladding n<sub>z</sub></>} unit="n" value={displayMaterialAxis(draft, "cladding", "z")} min={1} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndexZ", v)} />
                {materialDefinition(draft.coreMaterial ?? "custom").anisotropic && <>
                  <NumberField label="Optic-axis polar angle θ" unit="° from +y" value={draft.coreOpticAxisTiltDeg ?? legacyOpticAxisTilt(draft.coreOpticAxis)} min={0} max={90} step={1} onChange={(v) => updateNumber("coreOpticAxisTiltDeg", v)} />
                  <NumberField label="Optic-axis azimuth φ" unit="° from +z toward +x" value={draft.coreOpticAxisAzimuthDeg ?? legacyOpticAxisAzimuth(draft.coreOpticAxis)} min={0} max={360} step={1} onChange={(v) => updateNumber("coreOpticAxisAzimuthDeg", v)} />
                </>}
                {(draft.coreMaterial ?? "custom") === "lithium-niobate" && <><NumberField label="LiNbO₃ temperature" unit="°C" value={draft.materialTemperatureC ?? 21} min={20} max={240} step={1} onChange={(v) => updateNumber("materialTemperatureC", v)} /><NumberField label="DC field along optic axis" unit="V/µm" value={draft.coreElectricFieldVPerUm ?? 0} min={-100} max={100} step={0.1} onChange={(v) => updateNumber("coreElectricFieldVPerUm", v)} /></>}
                <NumberField label="Core κ" unit="Im(n)" value={displayMaterialExtinction(draft, "core")} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={(draft.coreMaterial ?? "custom") === "tabulated"} onChange={(v) => updateNumber("coreExtinction", v)} />
                <NumberField label="Cladding κ" unit="Im(n)" value={displayMaterialExtinction(draft, "cladding")} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={(draft.claddingMaterial ?? "custom") === "tabulated"} onChange={(v) => updateNumber("claddingExtinction", v)} />
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
              <p>Uniaxial built-in materials use ε = εₒI + (εₑ − εₒ)aaᵀ. Polar angle θ is measured from +y and azimuth φ from +z toward +x, allowing an arbitrary 3D optic axis. Imported CSV data use wavelength_um,n,k with linear interpolation and no extrapolation. Off-diagonal tensors are limited to straight, lossless guides with hard boundaries.</p>
            </details>
            <button className="solve-button" type="submit" disabled={busy}>Solve modes <span aria-hidden="true">→</span></button>
            <p className="status" aria-live="polite">{message}</p>{error && <p className="error" role="alert">{error}</p>}
          </form>
        </aside>

        <section className="results-panel" id="results-panel" aria-labelledby="results-title">
          <div className="panel-heading results-heading"><div><span className="step">02</span><h2 id="results-title">Results explorer</h2></div><button className="export-button" type="button" onClick={exportField} disabled={!mode}>Export CSV</button></div>
          {result ? <>
            <div className="field-toolbar result-view-tabs" role="tablist" aria-label="Result view"><button type="button" role="tab" aria-selected={resultView === "mode"} className={resultView === "mode" ? "active" : ""} onClick={() => setResultView("mode")}>Mode fields</button><button type="button" role="tab" aria-selected={resultView === "geometry"} className={resultView === "geometry" ? "active" : ""} onClick={() => setResultView("geometry")}>Structure & mesh</button></div>
            {resultView === "geometry" ? <GeometryPlot config={config} result={result} mode={mode} /> : mode ? <>
            <div className="mode-tabs" role="tablist" aria-label="Guided modes">{result.modes.map((item, index) => <button type="button" role="tab" aria-selected={selectedMode === index} className={selectedMode === index ? "active" : ""} key={`${item.id}-${index}`} onClick={() => setSelectedMode(index)}><span>{item.label} · {item.polarization}</span><small><i>n</i><sub>eff</sub> {item.effectiveIndex.toFixed(5)}{item.nearCutoff ? " · near cutoff" : ""}</small></button>)}</div>
            <div className="metrics">
              <Metric label={<>Effective index <i>n</i><sub>eff</sub></>} value={mode.effectiveIndex.toFixed(6)} />
              <Metric label={<>Propagation constant β</>} value={`${mode.propagationConstantPerUm.toFixed(4)} µm⁻¹`} />
              <Metric label="Electric confinement" value={`${(mode.electricConfinement * 100).toFixed(1)}%`} />
              <Metric label="Core power fraction" value={`${(mode.corePowerFraction * 100).toFixed(1)}%`} />
              <Metric label={<>Effective area <i>A</i><sub>eff</sub></>} value={`${mode.effectiveAreaUm2.toFixed(3)} µm²`} />
              <Metric label="Longitudinal E fraction" value={`${(mode.longitudinalElectricFraction * 100).toFixed(1)}%`} />
              <Metric label="x-polarized E fraction" value={`${(mode.xPolarizedElectricFraction * 100).toFixed(1)}%`} />
              <Metric label="Total attenuation" value={`${mode.lossDbPerCm.toPrecision(3)} dB/cm`} />
              <Metric label={<>Imaginary index Im(<i>n</i><sub>eff</sub>)</>} value={mode.effectiveIndexImaginary.toExponential(3)} />
              <Metric label="Normalized modal power" value={`${(mode.modalPowerW * 1e3).toFixed(3)} mW`} />
              <Metric label="Guidance margin" value={`${mode.guidanceMargin.toExponential(3)}${mode.nearCutoff ? " · review" : ""}`} />
              {mode.bendRadiusUm && <Metric label="Bend radius" value={`${mode.bendRadiusUm.toFixed(3)} µm`} />}
              {mode.azimuthalModeNumber && <Metric label="Azimuthal order m = βR" value={mode.azimuthalModeNumber.toFixed(3)} />}
            </div>
            <div className="field-toolbar" aria-label="Field component"><span>Field</span>{fieldComponents.map((field) => <button type="button" className={component === field ? "active" : ""} aria-pressed={component === field} key={field} onClick={() => setComponent(field)}>{(config.bendRadiusUm ?? 0) > 0 && field === "Ez" ? <>E<sub>θ</sub></> : (config.bendRadiusUm ?? 0) > 0 && field === "Hz" ? <>H<sub>θ</sub></> : (config.bendRadiusUm ?? 0) > 0 && field === "poynting" ? <>S<sub>θ</sub></> : fieldLabels[field]}</button>)}</div>
            <ModePlot component={component} config={config} mode={mode} xUm={result.xUm} yUm={result.yUm} />
            </> : <div className="empty-state">No guided mode was found. Inspect the structure and mesh, then increase the core size or index contrast.</div>}
          </> : <div className="empty-state">The solved structure and modes will appear here.</div>}
        </section>
      </div>
      </section>

      <section className="app-view" id="sweeps" hidden={activeView !== "sweeps"} aria-labelledby="sweeps-title">
      <ViewHeading eyebrow="Parametric exploration" title="Sweeps" id="sweeps-title">Track the selected mode across wavelength and geometry while preserving field-overlap continuity.</ViewHeading>
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
          <label className="select-field">Parameter<select value={geometrySweep.parameter} onChange={(event) => setGeometrySweep((current) => event.target.value === "bendRadiusUm" ? { ...current, parameter: "bendRadiusUm", startValueUm: 0.75 * (config.bendRadiusUm ?? 10), stopValueUm: 1.25 * (config.bendRadiusUm ?? 10) } : { ...current, parameter: event.target.value as GeometrySweepParameter })}>
            <option value="widthUm">Core width</option><option value="heightUm">Core height</option>{(config.geometry ?? "channel") === "slot" && <option value="slotGapUm">Slot gap</option>}
            {(config.geometry ?? "channel") === "coupler" && <option value="couplerGapUm">Coupler gap</option>}
            {(config.bendRadiusUm ?? 0) > 0 && <option value="bendRadiusUm">Bend radius</option>}
          </select></label>
          <NumberField label="Start value" unit="µm" value={geometrySweep.startValueUm} min={0.01} max={geometrySweepMaximum} step={0.01} onChange={(value) => setGeometrySweep((current) => ({ ...current, startValueUm: value }))} />
          <NumberField label="Stop value" unit="µm" value={geometrySweep.stopValueUm} min={0.01} max={geometrySweepMaximum} step={0.01} onChange={(value) => setGeometrySweep((current) => ({ ...current, stopValueUm: value }))} />
          <NumberField label="Samples" unit="points" value={geometrySweep.points} min={3} max={PARAMETER_MAXIMUMS.sweepPoints} step={1} onChange={(value) => setGeometrySweep((current) => ({ ...current, points: value }))} />
          <button className="solve-button" type="submit" disabled={busy || !mode}>Run sweep <span aria-hidden="true">→</span></button>
        </form>
        <p className="status" aria-live="polite">{geometrySweepMessage}</p>
        {geometrySweepResult && <><GeometrySweepPlot result={geometrySweepResult} />{geometrySweepResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</>}
      </section>
      </section>

      <section className="app-view" id="analysis" hidden={activeView !== "analysis"} aria-labelledby="analysis-title">
      <ViewHeading eyebrow="Research tools" title="Analysis" id="analysis-title">Verify convergence, quantify fabrication sensitivity, calculate coupling and compare cross-sections.</ViewHeading>
      <AdvancedAnalyses key={JSON.stringify(config)} config={config} result={result} selectedMode={selectedMode} presets={presets} />
      </section>

      <section className="app-view" id="validation" hidden={activeView !== "validation"} aria-labelledby="validation-title">
      <ViewHeading eyebrow="Scientific confidence" title="Validation" id="validation-title">Inspect the current modal checks, numerical formulation, assumptions and validity limits.</ViewHeading>
      <section className="validation-section">
        <div className="method-card"><p className="eyebrow">Numerical model</p><h2>Full-vector finite-difference eigenmode method</h2><p>{(config.bendRadiusUm ?? 0) > 0 ? <>The bent solver uses a radial coordinate transformation: the metric 1 + x/R modifies the material tensors, a reduced transverse-electric eigenproblem is solved by sparse shift–invert LU, and the magnetic and longitudinal fields are reconstructed.</> : result?.formulation === "first-order" ? <>The WebAssembly tensor solver uses a four-transverse-field first-order Maxwell eigenproblem and reconstructs the longitudinal fields, retaining all six independent components of the symmetric permittivity tensor.</> : <>The straight diagonal-tensor solver uses a SIMD WebAssembly coupled transverse magnetic-field eigenproblem.</>} Subpixel material averaging and geometry-aligned nonuniform differences improve interface and mesh convergence.</p><div className="equation">{result?.formulation === "first-order" ? <><b>B</b><b>Ψ</b><span>=</span><i>β</i><b>Ψ</b></> : result?.formulation === "transverse-e" ? <><b>PQ</b><b>E</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>E</b><sub>t</sub></> : <><span>U</span><b>H</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>H</b><sub>t</sub></>}</div><p className="limitation">Scope: linear, non-magnetic dielectrics; arbitrary real symmetric tensors are supported for straight guides with hard boundaries. Constant-radius bends, PML and material loss currently require a diagonal local tensor. Repeat mesh and domain sweeps before interpreting results quantitatively.</p></div>
        <div className="checks-card"><p className="eyebrow">Current solution</p><h2>Validation checks</h2><div className="checks">{validation.map((check) => <div key={check.label}><span className={check.pass ? "pass" : "warn"}>{check.pass ? "Pass" : "Review"}</span><strong>{check.label}</strong></div>)}</div>{mode && result && <dl className="solver-details"><div><dt>Numerical backend</dt><dd>{result.backend}</dd></div><div><dt>Mode classification</dt><dd>{mode.label}</dd></div><div><dt>x/y symmetry</dt><dd>{mode.symmetryX.toFixed(3)} / {mode.symmetryY.toFixed(3)}</dd></div><div><dt>Relative residual</dt><dd>{mode.residual.toExponential(2)}</dd></div><div><dt>Grid spacing range</dt><dd>{result.dxUm.toFixed(3)}–{result.dxMaxUm.toFixed(3)} µm</dd></div><div><dt>Longitudinal E fraction</dt><dd>{(mode.longitudinalElectricFraction * 100).toFixed(2)}%</dd></div><div><dt>Eₓ transverse fraction</dt><dd>{(mode.xPolarizedElectricFraction * 100).toFixed(2)}%</dd></div></dl>}{result?.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</div>
      </section>
      </section>
    </main>
    <footer><span>Waveguide Mode Solver</span><span>Built for photonics education · Check mesh, boundary and sweep convergence before design use.</span></footer>
  </div>;
}

function ViewHeading({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children: ReactNode }) {
  return <header className="view-heading"><p className="eyebrow">{eyebrow}</p><h1 id={id}>{title}</h1><p>{children}</p></header>;
}

function NumberField({ label, unit, value, min, max, step, disabled = false, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(parseNumericInput(event.target.value))} /><small>{unit}</small></div></label>;
}

function MaterialSelect({ label, value, allowTabulated = true, onChange }: { label: string; value: MaterialId; allowTabulated?: boolean; onChange: (value: MaterialId) => void }) {
  return <label className="select-field">{label}<select value={value} onChange={(event) => onChange(event.target.value as MaterialId)}>{MATERIALS.filter((material) => allowTabulated || material.id !== "tabulated").map((material) => <option value={material.id} key={material.id}>{material.name}</option>)}</select></label>;
}

function MaterialCsvInput({ region, table, onChange }: { region: string; table?: TabulatedMaterialData; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const range = table ? `${table.wavelengthUm[0]}–${table.wavelengthUm[table.wavelengthUm.length - 1]} µm · ${table.wavelengthUm.length} rows` : "wavelength_um,n,k";
  return <label className="material-csv-input"><span>{region} CSV</span><strong>{table?.name ?? "Choose file"}</strong><small>{range}</small><input type="file" accept=".csv,text/csv" onChange={onChange} /></label>;
}

function MaterialSources({ config }: { config: WaveguideConfig }) {
  const substrateActive = (config.geometry ?? "channel") === "multilayer" || (config.stackLayers?.length ?? 0) > 0;
  const selected = [...new Set([config.coreMaterial, config.claddingMaterial, ...(substrateActive ? [config.substrateMaterial] : []), ...(config.stackLayers ?? []).map((layer) => layer.material)])]
    .filter((id): id is MaterialId => Boolean(id && id !== "custom" && id !== "tabulated"))
    .map(materialDefinition);
  const imported = [config.coreMaterial === "tabulated" ? config.coreMaterialTable : undefined,
    config.claddingMaterial === "tabulated" ? config.claddingMaterialTable : undefined,
    ...(substrateActive && config.substrateMaterial === "tabulated" ? [config.substrateMaterialTable] : [])]
    .filter((table): table is TabulatedMaterialData => Boolean(table));
  if (selected.length === 0 && imported.length === 0) return null;
  return <p className="material-sources">Models: {selected.map((material, index) => <span key={material.id}>{index > 0 && " · "}{material.sourceUrl ? <a href={material.sourceUrl} target="_blank" rel="noreferrer">{material.sourceLabel}</a> : material.name} ({material.minimumWavelengthUm}–{material.maximumWavelengthUm} µm)</span>)}{imported.map((table) => <span key={table.name}> · {table.name} ({table.wavelengthUm[0]}–{table.wavelengthUm[table.wavelengthUm.length - 1]} µm)</span>)}</p>;
}

function displayMaterialIndex(materialId: MaterialId | undefined, wavelengthUm: number, fallback: number, temperatureC = 21, opticAxis: OpticAxis = "y", electricFieldVPerUm = 0, table?: TabulatedMaterialData): number {
  if (!materialId || materialId === "custom") return fallback;
  if (materialId === "tabulated") {
    try { return evaluateTabulatedMaterial(table as TabulatedMaterialData, wavelengthUm).n; } catch { return fallback; }
  }
  try { return evaluateMaterialAxes(materialId, wavelengthUm, temperatureC, opticAxis, electricFieldVPerUm).nx; } catch { return fallback; }
}

function displayMaterialAxis(config: WaveguideConfig, region: "core" | "cladding", axis: OpticAxis): number {
  const materialId = region === "core" ? config.coreMaterial : config.claddingMaterial;
  const fallback = region === "core" ? config.coreIndex : config.claddingIndex;
  if (!materialId || materialId === "custom") {
    return axis === "y" ? (region === "core" ? config.coreIndexY : config.claddingIndexY) ?? fallback
      : axis === "z" ? (region === "core" ? config.coreIndexZ : config.claddingIndexZ) ?? fallback : fallback;
  }
  if (materialId === "tabulated") {
    const table = region === "core" ? config.coreMaterialTable : config.claddingMaterialTable;
    try { return evaluateTabulatedMaterial(table as TabulatedMaterialData, config.wavelengthUm).n; } catch { return fallback; }
  }
  try {
    const opticAxis = region === "core" ? config.coreOpticAxis : config.claddingOpticAxis;
    const tilt = region === "core" ? config.coreOpticAxisTiltDeg : config.claddingOpticAxisTiltDeg;
    const azimuth = region === "core" ? config.coreOpticAxisAzimuthDeg : config.claddingOpticAxisAzimuthDeg;
    if (tilt !== undefined || azimuth !== undefined) {
      const principal = evaluateMaterialPrincipalIndices(materialId, config.wavelengthUm, config.materialTemperatureC ?? 21, region === "core" ? config.coreElectricFieldVPerUm : 0);
      const tensor = uniaxialPermittivityTensor(principal.ordinary, principal.extraordinary, opticAxisDirection(opticAxis, tilt, azimuth));
      return Math.sqrt(tensor[axis === "x" ? "xx" : axis === "y" ? "yy" : "zz"]);
    }
    return evaluateMaterialAxes(materialId, config.wavelengthUm, config.materialTemperatureC ?? 21, opticAxis, region === "core" ? config.coreElectricFieldVPerUm : 0)[`n${axis}`];
  } catch { return fallback; }
}

function displayMaterialExtinction(config: WaveguideConfig, region: "core" | "cladding"): number {
  const materialId = region === "core" ? config.coreMaterial : config.claddingMaterial;
  if (materialId !== "tabulated") return (region === "core" ? config.coreExtinction : config.claddingExtinction) ?? 0;
  const table = region === "core" ? config.coreMaterialTable : config.claddingMaterialTable;
  try { return evaluateTabulatedMaterial(table as TabulatedMaterialData, config.wavelengthUm).k; } catch { return 0; }
}

function legacyOpticAxisTilt(axis: OpticAxis = "y"): number {
  return axis === "y" ? 0 : 90;
}

function legacyOpticAxisAzimuth(axis: OpticAxis = "y"): number {
  return axis === "x" ? 90 : 0;
}

function Metric({ label, value }: { label: ReactNode; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

function download(content: string, filename: string, mimeType = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
