import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ModePlot, type DisplayInterpolation, type FieldPart } from "./ModePlot";
import { GeometryPlot } from "./GeometryPlot";
import { SweepPlot } from "./SweepPlot";
import { GeometrySweepPlot } from "./GeometrySweepPlot";
import { BlochSweepPlot } from "./BlochSweepPlot";
import { MaterialExplorer } from "./MaterialExplorer";
import { runSolverWorker } from "./workerClient";
import { AdvancedAnalyses } from "./AdvancedAnalyses";
import packageJson from "../package.json";
import {
  MATERIALS, complexRefractiveIndex, evaluateMaterialAxes, evaluateMaterialExtinction, evaluateMaterialPrincipalIndices, evaluateMetalPermittivity,
  evaluateTabulatedMaterial, isMetalMaterial, materialDefinition,
  opticAxisDirection, parseMaterialCsv, uniaxialPermittivityTensor,
  type MaterialId, type OpticAxis, type TabulatedMaterialData,
} from "./materials";
import {
  validateWaveguide,
  PARAMETER_MAXIMUMS,
  type FieldComponent,
  type BlochSweepAxis,
  type BlochSweepResult,
  type BlochSweepSettings,
  type GeometryType,
  type PolygonRegion,
  type GeometrySweepParameter,
  type GeometrySweepResult,
  type GeometrySweepSettings,
  type SolverResult,
  type SymmetryBoundary,
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
  autoMeshBias: true,
  boundary: "hard" as const,
  symmetryX: "none" as const,
  symmetryY: "none" as const,
  periodicX: false,
  periodicY: false,
  blochPhaseXRad: 0,
  blochPhaseYRad: 0,
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
  "Au · plasmonic stripe": {
    ...common, wavelengthUm: 1.55, widthUm: 0.5, heightUm: 0.2, coreIndex: 0.5,
    claddingIndex: 1.444, substrateIndex: 1.444, coreMaterial: "gold", claddingMaterial: "silica",
    substrateMaterial: "silica", paddingUm: 1.5, gridResolution: THIN_FILM_GRID_RESOLUTION, modeCount: 1,
  },
};

const initialConfig = presets["SiN · channel"];
const initialSweep: SweepSettings = { startWavelengthUm: 1.45, stopWavelengthUm: 1.65, points: 9, modeIndex: 0 };
const initialGeometrySweep: GeometrySweepSettings = { parameter: "widthUm", startValueUm: 0.7, stopValueUm: 1.3, points: 7, modeIndex: 0 };
const initialBlochSweep: BlochSweepSettings = { axis: "x", startPhaseRad: -Math.PI, stopPhaseRad: Math.PI, points: 9, modeIndex: 0 };
const fieldComponents: FieldComponent[] = ["Ex", "Ey", "Ez", "Hx", "Hy", "Hz", "intensity", "poynting"];
const fieldLabels: Record<FieldComponent, ReactNode> = {
  Ex: <>E<sub>x</sub></>, Ey: <>E<sub>y</sub></>, Ez: <>E<sub>z</sub></>,
  Hx: <>H<sub>x</sub></>, Hy: <>H<sub>y</sub></>, Hz: <>H<sub>z</sub></>, intensity: "|E|²", poynting: <>S<sub>z</sub></>,
};
type AppView = "solver" | "materials" | "sweeps" | "analysis" | "validation";
type ConfigurationTab = "geometry" | "materials" | "solver";
const appViews: Array<{ id: AppView; label: string; hint: string }> = [
  { id: "solver", label: "Mode Solver", hint: "Build & inspect" },
  { id: "materials", label: "Materials", hint: "Inspect optical data" },
  { id: "sweeps", label: "Sweeps", hint: "Track parameters" },
  { id: "analysis", label: "Analysis", hint: "Design studies" },
  { id: "validation", label: "Validation", hint: "Numerical confidence" },
];

function viewFromHash(): AppView {
  const hash = window.location.hash.slice(1);
  return appViews.some((view) => view.id === hash) ? hash as AppView : "solver";
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(() => typeof window === "undefined" ? "solver" : viewFromHash());
  const [solverPane, setSolverPane] = useState<"configure" | "results">("configure");
  const [sweepPane, setSweepPane] = useState<"wavelength" | "geometry" | "bloch">("wavelength");
  const [configurationTab, setConfigurationTab] = useState<ConfigurationTab>("geometry");
  const [draft, setDraft] = useState<WaveguideConfig>(initialConfig);
  const [config, setConfig] = useState<WaveguideConfig>(initialConfig);
  const [result, setResult] = useState<SolverResult>();
  const [selectedMode, setSelectedMode] = useState(0);
  const [component, setComponent] = useState<FieldComponent>("Ex");
  const [fieldPart, setFieldPart] = useState<FieldPart>("real");
  const [displayInterpolation, setDisplayInterpolation] = useState<DisplayInterpolation>(2);
  const [resultView, setResultView] = useState<"mode" | "geometry">("mode");
  const [sweepSettings, setSweepSettings] = useState(initialSweep);
  const [sweepResult, setSweepResult] = useState<SweepResult>();
  const [geometrySweep, setGeometrySweep] = useState(initialGeometrySweep);
  const [geometrySweepResult, setGeometrySweepResult] = useState<GeometrySweepResult>();
  const [blochSweep, setBlochSweep] = useState(initialBlochSweep);
  const [blochSweepResult, setBlochSweepResult] = useState<BlochSweepResult>();
  const [message, setMessage] = useState("Solving the default full-vector mode…");
  const [sweepMessage, setSweepMessage] = useState("Choose a wavelength range to calculate dispersion.");
  const [geometrySweepMessage, setGeometrySweepMessage] = useState("Sweep a device dimension while tracking the selected mode.");
  const [blochSweepMessage, setBlochSweepMessage] = useState("Enable a periodic boundary to calculate transverse-array dispersion.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const initialized = useRef(false);
  const mode = result ? (result.modes[selectedMode] ?? result.modes[0]) : undefined;
  const validation = useMemo(() => mode && result ? [
    { label: "Guided solution", pass: mode.guidanceMargin > 0 && !mode.nearCutoff },
    { label: "Eigenpair residual", pass: mode.residual < 2e-3 },
    { label: "Positive dispersive stored energy", pass: mode.storedEnergyPerM > 0 },
    ...((config.boundary ?? "hard") === "pml" ? [{ label: "Not PML-localized", pass: mode.physicalClass !== "pml" }] : []),
    { label: "Core sampled", pass: Math.min(
      result.xUm.filter((x) => Math.abs(x) <= config.widthUm / 2).length,
      result.yUm.filter((y) => Math.abs(y) <= config.heightUm / 2).length,
    ) >= 8 },
    ...(mode.absorbedPowerPerM > 0 && (config.boundary ?? "hard") === "hard"
      ? [{ label: "Eigenvalue / absorption loss balance", pass: mode.lossBalanceRelativeDifference < 0.1 }]
      : []),
    ...((config.bendRadiusUm ?? 0) > 0 ? [{ label: "Open radial boundary", pass: (config.boundary ?? "hard") === "pml" }] : []),
  ] : [], [config, mode, result]);
  const geometrySweepMaximum = geometrySweep.parameter === "bendRadiusUm" ? PARAMETER_MAXIMUMS.bendRadiusUm : PARAMETER_MAXIMUMS.dimensionUm;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void runSolverWorker<SolverResult>({ kind: "solve", config: initialConfig })
      .then((initialResult) => {
        setResult(initialResult);
        setMessage(`${initialResult.modes.length} guided mode${initialResult.modes.length === 1 ? "" : "s"} found on a ${initialResult.nx} × ${initialResult.ny} Yee grid with automatic x/y grading ${initialResult.meshBiasX.toFixed(2)}/${initialResult.meshBiasY.toFixed(2)}.`);
      })
      .catch((caught) => { setError(caught instanceof Error ? caught.message : "The initial mode solve failed."); setMessage("Solve failed."); })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (blochSweep.axis === "x" && !config.periodicX && config.periodicY) setBlochSweep((current) => ({ ...current, axis: "y" }));
    if (blochSweep.axis === "y" && !config.periodicY && config.periodicX) setBlochSweep((current) => ({ ...current, axis: "x" }));
  }, [blochSweep.axis, config.periodicX, config.periodicY]);

  useEffect(() => {
    const syncView = () => setActiveView(viewFromHash());
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      if (window.matchMedia("(max-width: 900px)").matches) {
        document.querySelector(".app-nav a.active")?.scrollIntoView({ block: "nearest", inline: "center" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, solverPane, sweepPane]);

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

  function updatePolygonRegion(index: number, update: Partial<PolygonRegion>) {
    setDraft((current) => ({ ...current, polygonRegions: (current.polygonRegions ?? []).map((region, regionIndex) => regionIndex === index ? { ...region, ...update } : region) }));
  }

  function addPolygonRegion() {
    setDraft((current) => {
      const count = current.polygonRegions?.length ?? 0;
      const halfWidth = current.widthUm / 8;
      const halfHeight = current.heightUm / 8;
      const centerX = count % 2 === 0 ? -current.widthUm / 4 : current.widthUm / 4;
      const centerY = Math.floor(count / 2) % 2 === 0 ? 0 : current.heightUm / 4;
      return { ...current, polygonRegions: [...(current.polygonRegions ?? []), {
        name: `Region ${count + 1}`, material: "custom", index: current.coreIndex, extinction: 0,
        vertices: [
          { xUm: centerX - halfWidth, yUm: centerY - halfHeight }, { xUm: centerX + halfWidth, yUm: centerY - halfHeight },
          { xUm: centerX + halfWidth, yUm: centerY + halfHeight }, { xUm: centerX - halfWidth, yUm: centerY + halfHeight },
        ],
      }] };
    });
  }

  function updatePolygonVertex(regionIndex: number, vertexIndex: number, coordinate: "xUm" | "yUm", value: number) {
    setDraft((current) => ({ ...current, polygonRegions: (current.polygonRegions ?? []).map((region, index) => index === regionIndex ? {
      ...region, vertices: region.vertices.map((vertex, position) => position === vertexIndex ? { ...vertex, [coordinate]: value } : vertex),
    } : region) }));
  }

  async function importPolygons(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const regions = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as { polygonRegions?: unknown }).polygonRegions)
        ? (value as { polygonRegions: unknown[] }).polygonRegions : undefined;
      if (!regions || !isPolygonRegions(regions)) throw new Error("Expected valid polygon regions with name, material, index and finite xUm/yUm vertices.");
      const next = { ...draft, geometry: "polygon" as const, polygonRegions: regions };
      const errors = validateWaveguide(next);
      if (errors.length > 0) throw new Error(errors.join(" "));
      setDraft(next);
      setError("");
      setMessage(`${regions.length} polygon region${regions.length === 1 ? "" : "s"} imported. Solve to apply them.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The polygon JSON could not be imported.");
    }
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
        setBlochSweepResult(undefined);
        setSolverPane("results");
        setGeometrySweep((current) => (
          (current.parameter === "slotGapUm" && (draft.geometry ?? "channel") !== "slot")
          || (current.parameter === "couplerGapUm" && (draft.geometry ?? "channel") !== "coupler")
          || (current.parameter === "bendRadiusUm" && (draft.bendRadiusUm ?? 0) <= 0)
            ? { ...current, parameter: "widthUm" } : current
        ));
        setBlochSweep((current) => ({ ...current, axis: draft.periodicX ? "x" : draft.periodicY ? "y" : current.axis }));
        setMessage(`${next.modes.length} guided mode${next.modes.length === 1 ? "" : "s"} found on a ${next.nx} × ${next.ny} Yee grid${draft.autoMeshBias ? ` with automatic x/y grading ${next.meshBiasX.toFixed(2)}/${next.meshBiasY.toFixed(2)}` : ""}.`);
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
        setSweepMessage(`${next.points.length} wavelengths solved with reciprocal complex-mode tracking.`);
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
      setGeometrySweepMessage(`${next.points.length} geometries solved with resampled reciprocal tracking.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The geometry sweep failed.");
      setGeometrySweepMessage("Geometry sweep failed.");
    } finally { setBusy(false); }
  }

  async function runBlochSweep(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setBlochSweepMessage("Tracking the modal subspace across Bloch phase…");
    try {
      const next = await runSolverWorker<BlochSweepResult>({ kind: "blochSweep", config, settings: { ...blochSweep, modeIndex: selectedMode } });
      setBlochSweepResult(next);
      setBlochSweepMessage(`${next.points.length} Bloch phases solved with degenerate-subspace tracking.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Bloch sweep failed.");
      setBlochSweepMessage("Bloch sweep failed.");
    } finally { setBusy(false); }
  }

  function exportField() {
    if (!mode || !result) return;
    const rows = ["x_um,y_um,Ex_real_V_m,Ex_imag_V_m,Ey_real_V_m,Ey_imag_V_m,Ez_real_V_m,Ez_imag_V_m,Hx_real_A_m,Hx_imag_A_m,Hy_real_A_m,Hy_imag_A_m,Hz_real_A_m,Hz_imag_A_m,E2_V2_m2,Sz_W_m2"];
    for (let row = 0; row < result.yUm.length; row += 1) {
      for (let column = 0; column < result.xUm.length; column += 1) {
        rows.push([result.xUm[column], result.yUm[row],
          mode.complexFields.Ex.real[row][column], mode.complexFields.Ex.imaginary[row][column],
          mode.complexFields.Ey.real[row][column], mode.complexFields.Ey.imaginary[row][column],
          mode.complexFields.Ez.real[row][column], mode.complexFields.Ez.imaginary[row][column],
          mode.complexFields.Hx.real[row][column], mode.complexFields.Hx.imaginary[row][column],
          mode.complexFields.Hy.real[row][column], mode.complexFields.Hy.imaginary[row][column],
          mode.complexFields.Hz.real[row][column], mode.complexFields.Hz.imaginary[row][column],
          mode.fields.intensity[row][column], mode.fields.poynting[row][column]].join(","));
      }
    }
    download(rows.join("\n"), `waveguide-${mode.id.toLowerCase()}-${config.wavelengthUm.toFixed(3)}um.csv`);
  }

  function exportSweep() {
    if (!sweepResult) return;
    const rows = ["wavelength_um,mode_label,near_cutoff,subspace_size,n_eff,n_group,dispersion_ps_nm_km,beta2_ps2_km,loss_db_cm,subspace_overlap",
      ...sweepResult.points.map((point) => [point.wavelengthUm, point.modeLabel, point.nearCutoff, point.degenerateSubspaceSize, point.effectiveIndex,
        point.groupIndex, point.dispersionPsPerNmKm, point.beta2Ps2PerKm, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), "waveguide-dispersion.csv");
  }

  function exportGeometrySweep() {
    if (!geometrySweepResult) return;
    const rows = ["value_um,mode_label,near_cutoff,subspace_size,n_eff,confinement,effective_area_um2,loss_db_cm,subspace_overlap",
      ...geometrySweepResult.points.map((point) => [point.valueUm, point.modeLabel, point.nearCutoff, point.degenerateSubspaceSize, point.effectiveIndex, point.electricConfinement,
        point.effectiveAreaUm2, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), `waveguide-${geometrySweepResult.parameter}-sweep.csv`);
  }

  function exportBlochSweep() {
    if (!blochSweepResult) return;
    const rows = ["phase_rad,phase_over_pi,mode_label,subspace_size,n_eff,n_eff_imag,loss_db_cm,subspace_overlap",
      ...blochSweepResult.points.map((point) => [point.phaseRad, point.phaseRad / Math.PI, point.modeLabel, point.degenerateSubspaceSize,
        point.effectiveIndex, point.effectiveIndexImaginary, point.lossDbPerCm, point.overlap].join(","))];
    download(rows.join("\n"), `waveguide-bloch-${blochSweepResult.axis}-sweep.csv`);
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
      blochSweep: blochSweepResult,
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
      <div>{appViews.map((view) => <a href={`#${view.id}`} aria-current={activeView === view.id ? "page" : undefined} className={activeView === view.id ? "active" : ""} key={view.id} onClick={(event) => { event.preventDefault(); navigateToView(view.id); }}><span>{view.label}</span><small>{view.hint}</small></a>)}</div>
    </nav>

    <main>
      <section className="app-view" id="solver" hidden={activeView !== "solver"} aria-labelledby="page-title">
      <header className="workspace-header">
        <div><p className="eyebrow">Full-vector eigenmode workspace</p><h1 id="page-title">Mode solver</h1><p>Configure the cross-section and inspect the solved electromagnetic modes.</p></div>
        <div className="workspace-actions"><div className="workspace-context" aria-label="Current model"><span>{config.geometry ?? "channel"}</span><span>{config.wavelengthUm.toFixed(3)} µm</span>{result && <span>{result.nx} × {result.ny} grid</span>}</div><div className="project-actions"><button type="button" className="export-button" onClick={exportProject}>Export project</button><label className="export-button">Import configuration<input type="file" accept="application/json,.json" onChange={importProject} /></label></div></div>
      </header>

      <div className="mobile-pane-tabs" role="tablist" aria-label="Mode solver workspace">
        <button type="button" role="tab" aria-selected={solverPane === "configure"} aria-controls="configuration-panel" className={solverPane === "configure" ? "active" : ""} onClick={() => setSolverPane("configure")}>Configure</button>
        <button type="button" role="tab" aria-selected={solverPane === "results"} aria-controls="results-panel" className={solverPane === "results" ? "active" : ""} onClick={() => setSolverPane("results")}>Results</button>
      </div>
      <div className="workspace" data-mobile-pane={solverPane}>
        <aside className="control-panel" id="configuration-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Configuration</h2></div><span className="method-chip">FDM</span></div>
          <form onSubmit={solve} noValidate>
            <label>Platform preset<select defaultValue="SiN · channel" onChange={(event) => applyPreset(event.target.value)}>{Object.keys(presets).map((name) => <option key={name}>{name}</option>)}</select></label>
            <div className="configuration-tabs" role="tablist" aria-label="Configuration sections">
              {(["geometry", "materials", "solver"] as ConfigurationTab[]).map((tab) => <button type="button" role="tab" aria-selected={configurationTab === tab} aria-controls={`configuration-${tab}`} className={configurationTab === tab ? "active" : ""} key={tab} onClick={() => setConfigurationTab(tab)}>{tab === "geometry" ? "Geometry" : tab === "materials" ? "Materials" : "Solver"}</button>)}
            </div>
            <section id="configuration-geometry" className="configuration-section" role="tabpanel" hidden={configurationTab !== "geometry"}>
              <div className="configuration-heading"><h3>Cross-section</h3><p>Define the physical structure and propagation path.</p></div>
              <label className="select-field">Geometry<select value={draft.geometry ?? "channel"} onChange={(event) => setDraft((current) => {
                const geometry = event.target.value as GeometryType;
                return geometry === "polygon" ? { ...current, geometry, stackLayers: [], symmetryX: "none", symmetryY: "none", polygonRegions: current.polygonRegions?.length ? current.polygonRegions : [{
                  name: "Core", material: current.coreMaterial ?? "custom", index: current.coreIndex, extinction: current.coreExtinction ?? 0,
                  vertices: [{ xUm: -current.widthUm / 2, yUm: -current.heightUm / 2 }, { xUm: current.widthUm / 2, yUm: -current.heightUm / 2 }, { xUm: current.widthUm / 2, yUm: current.heightUm / 2 }, { xUm: -current.widthUm / 2, yUm: current.heightUm / 2 }],
                }] } : { ...current, geometry };
              })}>
                <option value="channel">Channel</option><option value="rib">Rib</option><option value="slot">Slot</option><option value="coupler">Two-guide coupler</option><option value="multilayer">Multilayer ridge</option><option value="polygon">Polygon regions</option>
              </select></label>
              <div className="form-grid">
                <NumberField label={(draft.geometry ?? "channel") === "polygon" ? "Geometry span x" : (draft.geometry ?? "channel") === "coupler" ? "Guide width" : "Core width"} unit="µm" value={draft.widthUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("widthUm", v)} />
                <NumberField label={(draft.geometry ?? "channel") === "polygon" ? "Geometry span y" : "Core height"} unit="µm" value={draft.heightUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("heightUm", v)} />
                {(draft.geometry ?? "channel") === "rib" && <NumberField label="Slab height" unit="µm" value={draft.slabHeightUm ?? 0.15} min={0.01} max={Number.isFinite(draft.heightUm) ? draft.heightUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slabHeightUm", v)} />}
                {(draft.geometry ?? "channel") === "slot" && <NumberField label="Slot gap" unit="µm" value={draft.slotGapUm ?? 0.12} min={0.01} max={Number.isFinite(draft.widthUm) ? draft.widthUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slotGapUm", v)} />}
                {(draft.geometry ?? "channel") === "coupler" && <NumberField label="Coupler gap" unit="µm" value={draft.couplerGapUm ?? 0.2} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("couplerGapUm", v)} />}
                {!(["slot", "polygon"] as GeometryType[]).includes(draft.geometry ?? "channel") && <NumberField label="Sidewall angle" unit="°" value={draft.sidewallAngleDeg ?? 90} min={20} max={90} step={1} onChange={(v) => updateNumber("sidewallAngleDeg", v)} />}
                <label className="select-field">Propagation path<select value={(draft.bendRadiusUm ?? 0) > 0 ? "bend" : "straight"} onChange={(event) => setDraft((current) => event.target.value === "bend" ? { ...current, bendRadiusUm: current.bendRadiusUm && current.bendRadiusUm > 0 ? current.bendRadiusUm : 10, boundary: "pml" } : { ...current, bendRadiusUm: 0 })}><option value="straight">Straight</option><option value="bend">Constant-radius bend</option></select></label>
                {(draft.bendRadiusUm ?? 0) > 0 && <>
                  <NumberField label="Bend radius" unit="µm" value={draft.bendRadiusUm ?? 10} min={0.1} max={PARAMETER_MAXIMUMS.bendRadiusUm} step={0.5} onChange={(v) => updateNumber("bendRadiusUm", v)} />
                  <label className="select-field">Bend direction<select value={draft.bendDirection ?? "positive-x"} onChange={(event) => setDraft((current) => ({ ...current, bendDirection: event.target.value as "positive-x" | "negative-x" }))}><option value="positive-x">Outer side at +x</option><option value="negative-x">Outer side at −x</option></select></label>
                </>}
              </div>
              {(draft.geometry ?? "channel") === "polygon" && <details className="advanced-controls" open>
                <summary>Polygon regions ({draft.polygonRegions?.length ?? 0})</summary>
                <p>Build arbitrary cross-sections from non-overlapping convex regions. Coordinates are relative to the cross-section centre.</p>
                <div className="stack-editor polygon-editor">
                  {(draft.polygonRegions ?? []).map((region, regionIndex) => <div className="stack-layer polygon-region" key={regionIndex}>
                    <label>Region name<input value={region.name} onChange={(event) => updatePolygonRegion(regionIndex, { name: event.target.value })} /></label>
                    <MaterialSelect label="Material" value={region.material} allowTabulated={false} onChange={(material) => updatePolygonRegion(regionIndex, { material, index: displayMaterialIndex(material, draft.wavelengthUm, region.index, draft.materialTemperatureC) })} />
                    <NumberField label="Index" unit="n" value={displayPolygonIndex(region, draft)} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={region.material !== "custom"} onChange={(index) => updatePolygonRegion(regionIndex, { index })} />
                    <NumberField label="Extinction" unit="Im(n)" value={displayPolygonExtinction(region, draft)} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={materialExtinctionIsReadOnly(region.material, draft.wavelengthUm)} onChange={(extinction) => updatePolygonRegion(regionIndex, { extinction })} />
                    <div className="polygon-vertices">
                      <strong>Vertices (x, y) in µm</strong>
                      {region.vertices.map((vertex, vertexIndex) => <div key={vertexIndex}>
                        <input type="number" aria-label={`${region.name} vertex ${vertexIndex + 1} x`} value={Number.isFinite(vertex.xUm) ? vertex.xUm : ""} step="0.01" onChange={(event) => updatePolygonVertex(regionIndex, vertexIndex, "xUm", event.target.valueAsNumber)} />
                        <input type="number" aria-label={`${region.name} vertex ${vertexIndex + 1} y`} value={Number.isFinite(vertex.yUm) ? vertex.yUm : ""} step="0.01" onChange={(event) => updatePolygonVertex(regionIndex, vertexIndex, "yUm", event.target.valueAsNumber)} />
                        <button type="button" className="remove-layer" disabled={region.vertices.length <= 3} onClick={() => updatePolygonRegion(regionIndex, { vertices: region.vertices.filter((_, index) => index !== vertexIndex) })} aria-label={`Remove vertex ${vertexIndex + 1}`}>−</button>
                      </div>)}
                      <button type="button" className="export-button" disabled={region.vertices.length >= 32} onClick={() => {
                        const first = region.vertices[0]; const last = region.vertices[region.vertices.length - 1];
                        updatePolygonRegion(regionIndex, { vertices: [...region.vertices, { xUm: (first.xUm + last.xUm) / 2, yUm: (first.yUm + last.yUm) / 2 }] });
                      }}>Add vertex</button>
                    </div>
                    <button type="button" className="remove-layer" onClick={() => setDraft((current) => ({ ...current, polygonRegions: (current.polygonRegions ?? []).filter((_, index) => index !== regionIndex) }))} aria-label={`Remove ${region.name}`}>Remove region</button>
                  </div>)}
                </div>
                <div className="polygon-actions"><button type="button" className="export-button" onClick={addPolygonRegion} disabled={(draft.polygonRegions?.length ?? 0) >= 12}>Add region</button><button type="button" className="export-button" onClick={() => download(JSON.stringify({ polygonRegions: draft.polygonRegions ?? [] }, null, 2), "waveguide-polygons.json", "application/json;charset=utf-8")}>Export JSON</button><label className="export-button">Import JSON<input type="file" accept="application/json,.json" onChange={(event) => void importPolygons(event)} /></label></div>
              </details>}
              {(draft.geometry ?? "channel") !== "polygon" &&
              <details className="advanced-controls">
                <summary>Vertical stack ({draft.stackLayers?.length ?? 0} layers)</summary>
                <p>Finite layers are listed from the core downward; the base substrate continues below the final layer.</p>
                <div className="stack-editor">
                  {(draft.stackLayers ?? []).map((layer, index) => <div className="stack-layer" key={`${index}-${layer.name}`}>
                    <label>Layer name<input value={layer.name} onChange={(event) => updateStackLayer(index, { name: event.target.value })} /></label>
                    <MaterialSelect label="Material" value={layer.material} allowTabulated={false} onChange={(material) => updateStackLayer(index, { material, index: displayMaterialIndex(material, draft.wavelengthUm, layer.index, draft.materialTemperatureC, layer.opticAxis) })} />
                    <NumberField label="Thickness" unit="µm" value={layer.thicknessUm} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.05} onChange={(value) => updateStackLayer(index, { thicknessUm: value })} />
                    <NumberField label="Index" unit="n" value={displayMaterialIndex(layer.material, draft.wavelengthUm, layer.index, draft.materialTemperatureC, layer.opticAxis)} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={layer.material !== "custom"} onChange={(value) => updateStackLayer(index, { index: value })} />
                    <button type="button" className="remove-layer" onClick={() => removeStackLayer(index)} aria-label={`Remove ${layer.name}`}>Remove</button>
                  </div>)}
                </div>
                <button type="button" className="export-button add-layer" onClick={addStackLayer} disabled={(draft.stackLayers?.length ?? 0) >= 6}>Add layer</button>
              </details>}
            </section>

            <section id="configuration-materials" className="configuration-section" role="tabpanel" hidden={configurationTab !== "materials"}>
              <div className="configuration-heading"><h3>Optical materials</h3><p>Select models and edit custom tensor properties.</p></div>
              <div className="material-selectors">
                {(draft.geometry ?? "channel") !== "polygon" && <MaterialSelect label="Core material" value={draft.coreMaterial ?? "custom"} onChange={(value) => updateMaterial("coreMaterial", "coreIndex", value)} />}
                <MaterialSelect label="Cladding material" value={draft.claddingMaterial ?? "custom"} onChange={(value) => updateMaterial("claddingMaterial", "claddingIndex", value)} />
                {((draft.geometry ?? "channel") === "multilayer" || (draft.stackLayers?.length ?? 0) > 0) && <MaterialSelect label="Base substrate" value={draft.substrateMaterial ?? "custom"} onChange={(value) => updateMaterial("substrateMaterial", "substrateIndex", value)} />}
              </div>
              <div className="form-grid">
                {(draft.geometry ?? "channel") !== "polygon" && <NumberField label="Core nₓ" unit="n" value={displayMaterialAxis(draft, "core", "x")} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndex", v)} />}
                <NumberField label="Cladding nₓ" unit="n" value={displayMaterialAxis(draft, "cladding", "x")} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndex", v)} />
                {((draft.geometry ?? "channel") === "multilayer" || (draft.stackLayers?.length ?? 0) > 0) && <NumberField label="Base substrate n" unit="n" value={displayMaterialIndex(draft.substrateMaterial, draft.wavelengthUm, draft.substrateIndex ?? draft.claddingIndex, draft.materialTemperatureC, draft.substrateOpticAxis, 0, draft.substrateMaterialTable)} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.substrateMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("substrateIndex", v)} />}
              </div>
              <details className="advanced-controls">
                <summary>{(draft.geometry ?? "channel") === "polygon" ? "Cladding loss & dispersion" : "Anisotropy, loss & dispersion"}</summary>
              <div className="material-table-imports">
                {(draft.geometry ?? "channel") !== "polygon" && (draft.coreMaterial ?? "custom") === "tabulated" && <MaterialCsvInput region="Core" table={draft.coreMaterialTable} onChange={(event) => void importMaterialCsv("core", event)} />}
                {(draft.claddingMaterial ?? "custom") === "tabulated" && <MaterialCsvInput region="Cladding" table={draft.claddingMaterialTable} onChange={(event) => void importMaterialCsv("cladding", event)} />}
                {(draft.substrateMaterial ?? "custom") === "tabulated" && <MaterialCsvInput region="Substrate" table={draft.substrateMaterialTable} onChange={(event) => void importMaterialCsv("substrate", event)} />}
              </div>
              <div className="form-grid">
                {(draft.geometry ?? "channel") !== "polygon" && <><NumberField label="Core nᵧ" unit="n" value={displayMaterialAxis(draft, "core", "y")} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndexY", v)} />
                <NumberField label={<>Core n<sub>z</sub></>} unit="n" value={displayMaterialAxis(draft, "core", "z")} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreIndexZ", v)} /></>}
                <NumberField label="Cladding nᵧ" unit="n" value={displayMaterialAxis(draft, "cladding", "y")} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndexY", v)} />
                <NumberField label={<>Cladding n<sub>z</sub></>} unit="n" value={displayMaterialAxis(draft, "cladding", "z")} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingIndexZ", v)} />
                {(draft.geometry ?? "channel") !== "polygon" && materialDefinition(draft.coreMaterial ?? "custom").anisotropic && <>
                  <NumberField label="Optic-axis polar angle θ" unit="° from +y" value={draft.coreOpticAxisTiltDeg ?? legacyOpticAxisTilt(draft.coreOpticAxis)} min={0} max={90} step={1} onChange={(v) => updateNumber("coreOpticAxisTiltDeg", v)} />
                  <NumberField label="Optic-axis azimuth φ" unit="° from +z toward +x" value={draft.coreOpticAxisAzimuthDeg ?? legacyOpticAxisAzimuth(draft.coreOpticAxis)} min={0} max={360} step={1} onChange={(v) => updateNumber("coreOpticAxisAzimuthDeg", v)} />
                </>}
                {(draft.geometry ?? "channel") !== "polygon" && (draft.coreMaterial ?? "custom") === "lithium-niobate" && <><NumberField label="LiNbO₃ temperature" unit="°C" value={draft.materialTemperatureC ?? 21} min={20} max={240} step={1} onChange={(v) => updateNumber("materialTemperatureC", v)} /><NumberField label="DC field along optic axis" unit="V/µm" value={draft.coreElectricFieldVPerUm ?? 0} min={-100} max={100} step={0.1} onChange={(v) => updateNumber("coreElectricFieldVPerUm", v)} /></>}
                {(draft.geometry ?? "channel") !== "polygon" && <NumberField label="Core κ" unit="Im(n)" value={displayMaterialExtinction(draft, "core")} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={materialExtinctionIsReadOnly(draft.coreMaterial, draft.wavelengthUm)} onChange={(v) => updateNumber("coreExtinction", v)} />}
                <NumberField label="Cladding κ" unit="Im(n)" value={displayMaterialExtinction(draft, "cladding")} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={materialExtinctionIsReadOnly(draft.claddingMaterial, draft.wavelengthUm)} onChange={(v) => updateNumber("claddingExtinction", v)} />
                {(draft.geometry ?? "channel") !== "polygon" && <NumberField label="Core dn/dλ" unit="µm⁻¹" value={draft.coreDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} disabled={(draft.coreMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("coreDispersionPerUm", v)} />}
                <NumberField label="Clad. dn/dλ" unit="µm⁻¹" value={draft.claddingDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} disabled={(draft.claddingMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("claddingDispersionPerUm", v)} />
                {(draft.geometry ?? "channel") === "multilayer" && <>
                  <NumberField label="Substrate nᵧ" unit="n" value={draft.substrateIndexY ?? draft.substrateIndex ?? draft.claddingIndex} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.substrateMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("substrateIndexY", v)} />
                  <NumberField label={<>Substrate n<sub>z</sub></>} unit="n" value={draft.substrateIndexZ ?? draft.substrateIndex ?? draft.claddingIndex} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={(draft.substrateMaterial ?? "custom") !== "custom"} onChange={(v) => updateNumber("substrateIndexZ", v)} />
                  <NumberField label="Substrate κ" unit="Im(n)" value={displayMaterialExtinction(draft, "substrate")} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={materialExtinctionIsReadOnly(draft.substrateMaterial, draft.wavelengthUm)} onChange={(v) => updateNumber("substrateExtinction", v)} />
                  <NumberField label="Substrate dn/dλ" unit="µm⁻¹" value={draft.substrateDispersionPerUm ?? 0} min={-PARAMETER_MAXIMUMS.dispersionPerUm} max={PARAMETER_MAXIMUMS.dispersionPerUm} step={0.001} onChange={(v) => updateNumber("substrateDispersionPerUm", v)} />
                </>}
                <NumberField label="Reference λ" unit="µm" value={draft.materialReferenceWavelengthUm ?? draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("materialReferenceWavelengthUm", v)} />
              </div>
              <MaterialSources config={draft} />
              <p>Fields use exp(iβz − iωt), so passive media have κ ≥ 0 and Im(ε) ≥ 0. Metal presets use a dispersive local bulk model; imported wavelength_um,n,k tables support measured thin-film data. Off-diagonal tensors are limited to straight, lossless guides with hard boundaries.</p>
              </details>
            </section>

            <section id="configuration-solver" className="configuration-section" role="tabpanel" hidden={configurationTab !== "solver"}>
              <div className="configuration-heading"><h3>Numerical setup</h3><p>Control the mode search, mesh and outer boundary.</p></div>
              <div className="form-grid">
                <NumberField label="Wavelength" unit="µm" value={draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("wavelengthUm", v)} />
                <NumberField label="Modes" unit="modes" value={draft.modeCount} min={1} max={PARAMETER_MAXIMUMS.modeCount} step={1} onChange={(v) => updateNumber("modeCount", v)} />
                <NumberField label="Resolution" unit="cells" value={draft.gridResolution} min={24} max={PARAMETER_MAXIMUMS.gridResolution} step={1} onChange={(v) => updateNumber("gridResolution", v)} />
                <NumberField label="Mesh bias" unit={draft.autoMeshBias ? "automatic" : `0–${PARAMETER_MAXIMUMS.meshBias}`} value={draft.meshBias ?? 0} min={0} max={PARAMETER_MAXIMUMS.meshBias} step={0.1} disabled={draft.autoMeshBias} onChange={(v) => updateNumber("meshBias", v)} />
                <NumberField label="Padding" unit="µm" value={draft.paddingUm} min={0.2} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.1} onChange={(v) => updateNumber("paddingUm", v)} />
                <label className="checkbox-field"><input type="checkbox" checked={draft.autoMeshBias ?? false} onChange={(event) => setDraft((current) => ({ ...current, autoMeshBias: event.target.checked }))} /><span>Automatic mesh grading</span></label>
                <label className="select-field">Outer boundary<select value={draft.boundary ?? "hard"} onChange={(event) => setDraft((current) => ({ ...current, boundary: event.target.value as "hard" | "pml" }))}><option value="hard">Hard wall</option><option value="pml">PML (open)</option></select></label>
                <label className="select-field">x symmetry plane<select value={draft.symmetryX ?? "none"} onChange={(event) => setDraft((current) => ({ ...current, symmetryX: event.target.value as SymmetryBoundary, ...(event.target.value !== "none" ? { periodicX: false, periodicY: false, blochPhaseXRad: 0, blochPhaseYRad: 0 } : {}) }))}><option value="none">None</option><option value="pec">PEC · tangential E = 0</option><option value="pmc">PMC · tangential H = 0</option></select></label>
                <label className="select-field">y symmetry plane<select value={draft.symmetryY ?? "none"} onChange={(event) => setDraft((current) => ({ ...current, symmetryY: event.target.value as SymmetryBoundary, ...(event.target.value !== "none" ? { periodicX: false, periodicY: false, blochPhaseXRad: 0, blochPhaseYRad: 0 } : {}) }))}><option value="none">None</option><option value="pec">PEC · tangential E = 0</option><option value="pmc">PMC · tangential H = 0</option></select></label>
                {(draft.boundary ?? "hard") === "pml" && <>
                  <NumberField label="PML thickness" unit="µm" value={draft.pmlThicknessUm ?? draft.paddingUm * 0.6} min={0.01} max={Math.max(0.02, draft.paddingUm - 0.01)} step={0.05} onChange={(v) => updateNumber("pmlThicknessUm", v)} />
                  <NumberField label="PML strength" unit="σ" value={draft.pmlStrength ?? 4} min={0.1} max={50} step={0.5} onChange={(v) => updateNumber("pmlStrength", v)} />
                </>}
              </div>
              {draft.autoMeshBias && <p className="configuration-note">Automatic grading selects independent x/y center refinement from the core-to-domain span; geometry interfaces remain aligned explicitly.</p>}
              {((draft.symmetryX ?? "none") !== "none" || (draft.symmetryY ?? "none") !== "none") && <p className="configuration-note">Symmetry projects the full Yee operator onto the selected parity subspace. Use it only when the geometry and material tensor are mirror-symmetric.</p>}
              <details className="advanced-controls">
                <summary>Mode targeting</summary>
                <div className="form-grid">
                  <NumberField label={<>Target Re(<i>n</i><sub>eff</sub>)</>} unit="0 = auto" value={draft.targetEffectiveIndex ?? 0} min={0} max={100} step={0.01} onChange={(value) => setDraft((current) => ({ ...current, targetEffectiveIndex: value > 0 ? value : undefined }))} />
                  <NumberField label={<>Target Im(<i>n</i><sub>eff</sub>)</>} unit="optional" value={draft.targetEffectiveIndexImaginary ?? 0} min={0} max={100} step={0.000001} disabled={draft.targetEffectiveIndex === undefined} onChange={(value) => setDraft((current) => ({ ...current, targetEffectiveIndexImaginary: value > 0 ? value : undefined }))} />
                </div>
                <p>The real target sets the shift used by the eigensolver. The imaginary target ranks complex candidates; it does not widen the physically admissible index window.</p>
              </details>
              <details className="advanced-controls">
                <summary>Bloch-periodic boundaries</summary>
                <div className="form-grid">
                  <label className="checkbox-field"><input type="checkbox" checked={draft.periodicX ?? false} onChange={(event) => setDraft((current) => ({ ...current, periodicX: event.target.checked, ...(!event.target.checked ? { blochPhaseXRad: 0 } : {}), symmetryX: "none", symmetryY: "none", ...((event.target.checked && current.periodicY && current.boundary === "pml") ? { boundary: "hard" as const } : {}) }))} /><span>Periodic x pair</span></label>
                  <label className="checkbox-field"><input type="checkbox" checked={draft.periodicY ?? false} onChange={(event) => setDraft((current) => ({ ...current, periodicY: event.target.checked, ...(!event.target.checked ? { blochPhaseYRad: 0 } : {}), symmetryX: "none", symmetryY: "none", ...((event.target.checked && current.periodicX && current.boundary === "pml") ? { boundary: "hard" as const } : {}) }))} /><span>Periodic y pair</span></label>
                  {draft.periodicX && <NumberField label="Bloch phase x" unit="rad" value={draft.blochPhaseXRad ?? 0} min={-Math.PI} max={Math.PI} step={0.05} onChange={(value) => updateNumber("blochPhaseXRad", value)} />}
                  {draft.periodicY && <NumberField label="Bloch phase y" unit="rad" value={draft.blochPhaseYRad ?? 0} min={-Math.PI} max={Math.PI} step={0.05} onChange={(value) => updateNumber("blochPhaseYRad", value)} />}
                </div>
                <p>Opposite faces satisfy F(r + L) = F(r)e<sup>iθ</sup>. A zero phase is ordinary periodicity; PML remains active only along non-periodic axes. The full computational span is the lattice period, so Padding controls the separation between neighboring copies.</p>
              </details>
              <p className="configuration-note">Use the Analysis view for mesh and boundary convergence before interpreting quantitative results.</p>
            </section>
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
              <Metric label="Mode class" value={mode.physicalClass} />
              <Metric label="Dispersive-energy confinement" value={`${(mode.energyConfinement * 100).toFixed(1)}%`} />
              <Metric label="Core power fraction" value={`${(mode.corePowerFraction * 100).toFixed(1)}%`} />
              <Metric label={<>Energy effective area <i>A</i><sub>eff</sub></>} value={`${mode.energyEffectiveAreaUm2.toFixed(3)} µm²`} />
              <Metric label="Total attenuation" value={`${mode.lossDbPerCm.toPrecision(3)} dB/cm`} />
            </div>
            <details className="result-details">
              <summary>Additional modal quantities</summary>
              <div className="metrics secondary-metrics">
              <Metric label="Energy group index" value={`${mode.energyGroupIndex.toFixed(4)} · ${mode.energyMetricValidity}`} />
              <Metric label="Longitudinal E fraction" value={`${(mode.longitudinalElectricFraction * 100).toFixed(1)}%`} />
              <Metric label="x-polarized E fraction" value={`${(mode.xPolarizedElectricFraction * 100).toFixed(1)}%`} />
              <Metric label="Propagation length" value={Number.isFinite(mode.propagationLengthUm) ? `${mode.propagationLengthUm.toPrecision(4)} µm` : "∞"} />
              <Metric label={<>Imaginary index Im(<i>n</i><sub>eff</sub>)</>} value={mode.effectiveIndexImaginary.toExponential(3)} />
              <Metric label="Normalized modal power" value={`${(mode.modalPowerW * 1e3).toFixed(3)} mW`} />
              <Metric label="Guidance margin" value={`${mode.guidanceMargin.toExponential(3)}${mode.nearCutoff ? " · review" : ""}`} />
              {mode.bendRadiusUm && <Metric label="Bend radius" value={`${mode.bendRadiusUm.toFixed(3)} µm`} />}
              {mode.azimuthalModeNumber && <Metric label="Azimuthal order m = βR" value={mode.azimuthalModeNumber.toFixed(3)} />}
              </div>
            </details>
            <div className="field-toolbar" aria-label="Field component"><span>Field</span>{fieldComponents.map((field) => <button type="button" className={component === field ? "active" : ""} aria-pressed={component === field} key={field} onClick={() => setComponent(field)}>{(config.bendRadiusUm ?? 0) > 0 && field === "Ez" ? <>E<sub>θ</sub></> : (config.bendRadiusUm ?? 0) > 0 && field === "Hz" ? <>H<sub>θ</sub></> : (config.bendRadiusUm ?? 0) > 0 && field === "poynting" ? <>S<sub>θ</sub></> : fieldLabels[field]}</button>)}</div>
            <div className="field-toolbar field-part-toolbar" aria-label="Field display settings">{component !== "intensity" && component !== "poynting" && <><span>View</span>{(["real", "imaginary", "magnitude", "phase"] as FieldPart[]).map((part) => <button type="button" className={fieldPart === part ? "active" : ""} aria-pressed={fieldPart === part} key={part} onClick={() => setFieldPart(part)}>{part === "real" ? "Re" : part === "imaginary" ? "Im" : part === "magnitude" ? "|·|" : "Phase"}</button>)}</>}<label className="display-mesh">Display mesh<select value={displayInterpolation} onChange={(event) => setDisplayInterpolation(Number(event.target.value) as DisplayInterpolation)}><option value={1}>Solver grid</option><option value={2}>2× interpolated</option><option value={4}>4× interpolated</option></select></label></div>
            <ModePlot component={component} part={fieldPart} config={config} mode={mode} xUm={result.xUm} yUm={result.yUm} displayInterpolation={displayInterpolation} />
            </> : <div className="empty-state">No guided mode was found. Inspect the structure and mesh, then increase the core size or index contrast.</div>}
          </> : <div className="empty-state">The solved structure and modes will appear here.</div>}
        </section>
      </div>
      </section>

      <section className="app-view" id="materials" hidden={activeView !== "materials"} aria-labelledby="materials-title">
        <ViewHeading eyebrow="Optical material library" title="Material Explorer" id="materials-title">Inspect refractive index, extinction, complex permittivity and local material dispersion before solving.</ViewHeading>
        <MaterialExplorer />
      </section>

      <section className="app-view" id="sweeps" hidden={activeView !== "sweeps"} aria-labelledby="sweeps-title">
      <ViewHeading eyebrow="Parametric exploration" title="Sweeps" id="sweeps-title">Track the selected mode across wavelength and geometry using the reciprocal complex-field product.</ViewHeading>
      <nav className="section-tabs" aria-label="Sweep type">
        <button type="button" className={sweepPane === "wavelength" ? "active" : ""} aria-pressed={sweepPane === "wavelength"} onClick={() => setSweepPane("wavelength")}><span>Wavelength</span><small>Dispersion & loss</small></button>
        <button type="button" className={sweepPane === "geometry" ? "active" : ""} aria-pressed={sweepPane === "geometry"} onClick={() => setSweepPane("geometry")}><span>Geometry</span><small>Dimensions & bends</small></button>
        <button type="button" className={sweepPane === "bloch" ? "active" : ""} aria-pressed={sweepPane === "bloch"} onClick={() => setSweepPane("bloch")}><span>Bloch phase</span><small>Periodic arrays</small></button>
      </nav>
      <section className="sweep-section tabbed-section" hidden={sweepPane !== "wavelength"}>
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

      <section className="sweep-section tabbed-section" hidden={sweepPane !== "geometry"}>
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

      <section className="sweep-section tabbed-section" hidden={sweepPane !== "bloch"}>
        <div className="panel-heading"><div><span className="step">05</span><h2>Transverse Bloch dispersion</h2></div><button className="export-button" type="button" disabled={!blochSweepResult} onClick={exportBlochSweep}>Export CSV</button></div>
        <p className="section-intro">Sweep the transverse Bloch phase of an infinite periodic array. All calculated eigenvalues are shown; the selected branch uses degenerate-subspace tracking.</p>
        <form className="sweep-controls" onSubmit={runBlochSweep}>
          <label className="select-field">Periodic axis<select value={blochSweep.axis} onChange={(event) => setBlochSweep((current) => ({ ...current, axis: event.target.value as BlochSweepAxis }))}><option value="x" disabled={!config.periodicX}>x boundary pair</option><option value="y" disabled={!config.periodicY}>y boundary pair</option></select></label>
          <NumberField label="Start phase" unit="rad" value={blochSweep.startPhaseRad} min={-Math.PI} max={Math.PI} step={0.05} onChange={(value) => setBlochSweep((current) => ({ ...current, startPhaseRad: value }))} />
          <NumberField label="Stop phase" unit="rad" value={blochSweep.stopPhaseRad} min={-Math.PI} max={Math.PI} step={0.05} onChange={(value) => setBlochSweep((current) => ({ ...current, stopPhaseRad: value }))} />
          <NumberField label="Samples" unit="points" value={blochSweep.points} min={3} max={PARAMETER_MAXIMUMS.sweepPoints} step={2} onChange={(value) => setBlochSweep((current) => ({ ...current, points: value }))} />
          <button className="solve-button" type="submit" disabled={busy || !mode || (!config.periodicX && !config.periodicY)}>Run Bloch sweep <span aria-hidden="true">→</span></button>
        </form>
        <p className="status" aria-live="polite">{blochSweepMessage}</p>
        {blochSweepResult && <><div className="analysis-metrics"><div><span>Reciprocity max |n<sub>eff</sub>(θ) − n<sub>eff</sub>(−θ)|</span><strong>{blochSweepResult.reciprocityError === undefined ? "Not evaluated" : blochSweepResult.reciprocityError.toExponential(3)}</strong></div><div><span>Tracked subspace</span><strong>{Math.max(...blochSweepResult.points.map((point) => point.degenerateSubspaceSize))} mode(s)</strong></div></div><BlochSweepPlot result={blochSweepResult} />{blochSweepResult.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</>}
      </section>
      </section>

      <section className="app-view" id="analysis" hidden={activeView !== "analysis"} aria-labelledby="analysis-title">
      <ViewHeading eyebrow="Research tools" title="Analysis" id="analysis-title">Verify convergence, quantify fabrication sensitivity, calculate coupling and compare cross-sections.</ViewHeading>
      <AdvancedAnalyses key={JSON.stringify(config)} config={config} result={result} selectedMode={selectedMode} presets={presets} />
      </section>

      <section className="app-view" id="validation" hidden={activeView !== "validation"} aria-labelledby="validation-title">
      <ViewHeading eyebrow="Scientific confidence" title="Validation" id="validation-title">Inspect the current modal checks, numerical formulation, assumptions and validity limits.</ViewHeading>
      <section className="validation-section">
        <div className="method-card"><p className="eyebrow">Numerical model</p><h2>Full-vector finite-difference eigenmode method</h2><p>{(config.bendRadiusUm ?? 0) > 0 ? <>The bent solver uses a radial coordinate transformation: the metric 1 + x/R modifies the material tensors, a reduced transverse-electric eigenproblem is solved by sparse shift–invert LU, and the magnetic and longitudinal fields are reconstructed.</> : result?.formulation === "first-order" ? <>The Rust/WebAssembly tensor solver uses a four-transverse-field first-order Maxwell eigenproblem and reconstructs the longitudinal fields, retaining all six independent components of the symmetric permittivity tensor.</> : <>The straight diagonal-tensor solver uses a Rust/WebAssembly coupled transverse magnetic-field eigenproblem.</>} Subpixel material averaging and geometry-aligned nonuniform differences improve interface and mesh convergence.</p><div className="equation">{result?.formulation === "first-order" ? <><b>B</b><b>Ψ</b><span>=</span><i>β</i><b>Ψ</b></> : result?.formulation === "transverse-e" ? <><b>PQ</b><b>E</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>E</b><sub>t</sub></> : <><span>U</span><b>H</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>H</b><sub>t</sub></>}</div><p className="limitation">Scope: linear, local, non-magnetic materials. Straight guides support diagonal complex permittivity, including metals and transverse Bloch-periodic boundaries; arbitrary real symmetric tensors require hard boundaries. Metallic bends, longitudinal periodicity and nonlocal nanoscale response are outside the validated scope. Repeat mesh and domain sweeps before interpreting results quantitatively.</p></div>
        <div className="checks-card"><p className="eyebrow">Current solution</p><h2>Validation checks</h2><div className="checks">{validation.map((check) => <div key={check.label}><span className={check.pass ? "pass" : "warn"}>{check.pass ? "Pass" : "Review"}</span><strong>{check.label}</strong></div>)}</div>{mode && result && <dl className="solver-details"><div><dt>Numerical backend</dt><dd>{result.backend}</dd></div><div><dt>Mode classification</dt><dd>{mode.label} · {mode.physicalClass}</dd></div><div><dt>x/y field symmetry</dt><dd>{mode.symmetryX.toFixed(3)} / {mode.symmetryY.toFixed(3)}</dd></div><div><dt>Symmetry state reduction</dt><dd>{result.symmetryReductionFactor.toFixed(2)}×</dd></div>{(config.periodicX || config.periodicY) && <div><dt>Bloch cell / phase</dt><dd>{config.periodicX ? `x ${(result.xEdgesUm.at(-1)! - result.xEdgesUm[0]).toFixed(3)} µm, θ=${(config.blochPhaseXRad ?? 0).toFixed(3)}` : ""}{config.periodicX && config.periodicY ? " · " : ""}{config.periodicY ? `y ${(result.yEdgesUm.at(-1)! - result.yEdgesUm[0]).toFixed(3)} µm, θ=${(config.blochPhaseYRad ?? 0).toFixed(3)}` : ""}</dd></div>}<div><dt>Relative residual</dt><dd>{mode.residual.toExponential(2)}</dd></div><div><dt>Grid spacing range</dt><dd>{result.dxUm.toFixed(3)}–{result.dxMaxUm.toFixed(3)} µm</dd></div><div><dt>Longitudinal E fraction</dt><dd>{(mode.longitudinalElectricFraction * 100).toFixed(2)}%</dd></div><div><dt>Eₓ transverse fraction</dt><dd>{(mode.xPolarizedElectricFraction * 100).toFixed(2)}%</dd></div></dl>}{result?.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</div>
      </section>
      {mode && result && <section className="sweep-section validation-diagnostics">
        <div className="panel-heading"><div><span className="step">V1</span><h2>Complex-mode diagnostics</h2></div><a className="export-button" href="https://github.com/jorpago2/waveguide-mode-solver/blob/main/REFERENCES.md" target="_blank" rel="noreferrer">References</a></div>
        <div className="analysis-metrics">
          <Metric label="Total attenuation" value={`${mode.lossDbPerCm.toPrecision(4)} dB/cm`} />
          <Metric label="Material absorption" value={`${mode.absorptionLossDbPerCm.toPrecision(4)} dB/cm`} />
          <Metric label="PML / radiative excess" value={`${mode.radiationLossDbPerCm.toPrecision(4)} dB/cm`} />
          <Metric label="Loss-balance mismatch" value={`${(100 * mode.lossBalanceRelativeDifference).toPrecision(3)}%`} />
          <Metric label="Absorbed power per length" value={`${mode.absorbedPowerPerM.toExponential(3)} W/m`} />
          <Metric label="Propagation length" value={Number.isFinite(mode.propagationLengthUm) ? `${mode.propagationLengthUm.toPrecision(5)} µm` : "∞"} />
          <Metric label="PML energy participation" value={`${(100 * mode.pmlEnergyFraction).toPrecision(3)}%`} />
          <Metric label="Outer-cell energy" value={`${(100 * mode.boundaryEnergyFraction).toPrecision(3)}%`} />
          <Metric label="Stored energy per length" value={`${mode.storedEnergyPerM.toExponential(3)} J/m`} />
          <Metric label="Energy metric validity" value={mode.energyMetricValidity} />
        </div>
        {mode.materialAbsorption.length > 0 && <div className="comparison-scroll"><table className="comparison-table"><caption>Material absorption decomposition</caption><thead><tr><th>Region</th><th>Absorbed power per length</th><th>Fraction</th></tr></thead><tbody>{mode.materialAbsorption.map((entry) => <tr key={entry.region}><th>{entry.region}</th><td>{entry.powerPerM.toExponential(4)} W/m</td><td>{(100 * entry.fraction).toFixed(2)}%</td></tr>)}</tbody></table></div>}
        <p className="limitation">Material absorption is obtained from the local Im(ε) field integral. Stored energy uses d(ω Re ε)/dω and is exact for lossless dispersion, a narrow-band approximation for weak loss, and diagnostic only for strongly absorptive media. PML classification is participation-based; establish leaky-mode loss with boundary and mesh convergence.</p>
        <div className="comparison-scroll"><table className="comparison-table candidate-table"><caption>Ritz candidates · target {result.searchTargetEffectiveIndex.toFixed(5)} · window {result.searchWindow.minimum.toFixed(5)}–{result.searchWindow.maximum.toFixed(5)}</caption><thead><tr><th>Candidate</th><th>Re(neff)</th><th>Im(neff)</th><th>Residual</th><th>Status</th><th>Reason</th></tr></thead><tbody>{result.candidates.map((candidate, index) => <tr key={`${candidate.effectiveIndex}-${candidate.effectiveIndexImaginary}-${index}`}><th>{candidate.label ?? `Ritz ${index + 1}`}</th><td>{candidate.effectiveIndex.toFixed(7)}</td><td>{candidate.effectiveIndexImaginary.toExponential(3)}</td><td>{candidate.residual.toExponential(2)}</td><td><span className={candidate.status === "selected" || candidate.status === "available" ? "pass" : "warn"}>{candidate.status}</span></td><td>{candidate.reason}</td></tr>)}</tbody></table></div>
      </section>}
      </section>
    </main>
    <footer><span>Waveguide Mode Solver</span><span>Built for photonics education · Check mesh, boundary and sweep convergence before design use.</span></footer>
  </div>;
}

function ViewHeading({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children: ReactNode }) {
  return <header className="view-heading"><p className="eyebrow">{eyebrow}</p><h1 id={id}>{title}</h1><p>{children}</p></header>;
}

function NumberField({ label, unit, value, min, max, step, disabled = false, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(event.target.valueAsNumber)} /><small>{unit}</small></div></label>;
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
  const polygonActive = (config.geometry ?? "channel") === "polygon";
  const selected = [...new Set([...(polygonActive ? [] : [config.coreMaterial]), config.claddingMaterial, ...(substrateActive ? [config.substrateMaterial] : []), ...(config.stackLayers ?? []).map((layer) => layer.material), ...(polygonActive ? (config.polygonRegions ?? []).map((region) => region.material) : [])])]
    .filter((id): id is MaterialId => Boolean(id && id !== "custom" && id !== "tabulated"))
    .map(materialDefinition);
  const imported = [config.coreMaterial === "tabulated" ? config.coreMaterialTable : undefined,
    config.claddingMaterial === "tabulated" ? config.claddingMaterialTable : undefined,
    ...(substrateActive && config.substrateMaterial === "tabulated" ? [config.substrateMaterialTable] : [])]
    .filter((table): table is TabulatedMaterialData => Boolean(table));
  if (selected.length === 0 && imported.length === 0) return null;
  return <p className="material-sources">Models: {selected.map((material, index) => <span key={material.id}>{index > 0 && " · "}{material.sourceUrl ? <a href={material.sourceUrl} target="_blank" rel="noreferrer">{material.sourceLabel}</a> : material.name} ({material.minimumWavelengthUm}–{material.maximumWavelengthUm} µm)</span>)}{imported.map((table) => <span key={table.name}> · {table.name} ({table.wavelengthUm[0]}–{table.wavelengthUm[table.wavelengthUm.length - 1]} µm)</span>)}</p>;
}

function displayPolygonIndex(region: PolygonRegion, config: WaveguideConfig): number {
  if (isMetalMaterial(region.material)) {
    try { return complexRefractiveIndex(evaluateMetalPermittivity(region.material, config.wavelengthUm)).n; } catch { return region.index; }
  }
  return displayMaterialIndex(region.material, config.wavelengthUm, region.index, config.materialTemperatureC);
}

function displayPolygonExtinction(region: PolygonRegion, config: WaveguideConfig): number {
  if (region.material !== "custom" && region.material !== "tabulated") {
    try { return evaluateMaterialExtinction(region.material, config.wavelengthUm) ?? region.extinction ?? 0; } catch { /* use stored value */ }
  }
  return region.extinction ?? 0;
}

function isPolygonRegions(value: unknown[]): value is PolygonRegion[] {
  return value.every((region) => typeof region === "object" && region !== null
    && typeof (region as PolygonRegion).name === "string"
    && MATERIALS.some((material) => material.id === (region as PolygonRegion).material)
    && typeof (region as PolygonRegion).index === "number"
    && ((region as PolygonRegion).extinction === undefined || typeof (region as PolygonRegion).extinction === "number")
    && Array.isArray((region as PolygonRegion).vertices)
    && (region as PolygonRegion).vertices.every((vertex) => typeof vertex?.xUm === "number" && typeof vertex?.yUm === "number"));
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

function displayMaterialExtinction(config: WaveguideConfig, region: "core" | "cladding" | "substrate"): number {
  const materialId = region === "core" ? config.coreMaterial : region === "cladding" ? config.claddingMaterial : config.substrateMaterial;
  if (materialId && materialId !== "custom" && materialId !== "tabulated") {
    try {
      const extinction = evaluateMaterialExtinction(materialId, config.wavelengthUm);
      if (extinction !== undefined) return extinction;
    } catch { /* use stored value */ }
  }
  if (materialId !== "tabulated") return (region === "core" ? config.coreExtinction : region === "cladding" ? config.claddingExtinction : config.substrateExtinction) ?? 0;
  const table = region === "core" ? config.coreMaterialTable : region === "cladding" ? config.claddingMaterialTable : config.substrateMaterialTable;
  try { return evaluateTabulatedMaterial(table as TabulatedMaterialData, config.wavelengthUm).k; } catch { return 0; }
}

function materialExtinctionIsReadOnly(materialId: MaterialId | undefined, wavelengthUm: number): boolean {
  if (materialId === "tabulated") return true;
  if (!materialId || materialId === "custom") return false;
  try { return evaluateMaterialExtinction(materialId, wavelengthUm) !== undefined; } catch { return false; }
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
