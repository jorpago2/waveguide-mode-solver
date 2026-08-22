import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  FileUploaderButton,
  InlineLoading,
  InlineNotification,
  Link,
  ProgressIndicator,
  ProgressStep,
  SkipToContent,
  TextInput,
  Tile,
  preview__IconIndicator as IconIndicator,
} from "@carbon/react";
import {
  ChartLine,
  CheckmarkOutline,
  Chemistry,
  DocumentExport,
  DocumentImport,
  Download,
  Play,
  Result,
  SettingsAdjust,
  StopOutline,
} from "@carbon/react/icons";
import { CarbonCheckboxField, CarbonNumberField, CarbonSelectField, CarbonSwitcher, CarbonTable } from "./CarbonControls";
import { CrossSectionPreview } from "./CrossSectionPreview";
import { ScientificAppShell, ScientificAutosaveStatus, ScientificEmptyState, ScientificHeader, ScientificHeaderAction, ScientificModelScope, ScientificOutcomeSummary, ScientificRecoveryNotice, ScientificRunControl, ScientificStatusBar, ScientificTaskPanel, ScientificToolRail, ScientificValidationSummary, useScientificAutosave, useScientificResultTransition, useScientificShortcut } from "@jorpago2/scientific-ui";
import type { DisplayInterpolation, FieldPart } from "./ModePlot";
import { cancelSolverWorker, isSolverWorkerCancellation, runSolverWorker } from "./workerClient";
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
  type WaveguideMode,
  type WaveguideConfig,
} from "./solver";

const ModePlot = lazy(() => import("./ModePlot").then((module) => ({ default: module.ModePlot })));
const GeometryPlot = lazy(() => import("./GeometryPlot").then((module) => ({ default: module.GeometryPlot })));
const SweepPlot = lazy(() => import("./SweepPlot").then((module) => ({ default: module.SweepPlot })));
const GeometrySweepPlot = lazy(() => import("./GeometrySweepPlot").then((module) => ({ default: module.GeometrySweepPlot })));
const BlochSweepPlot = lazy(() => import("./BlochSweepPlot").then((module) => ({ default: module.BlochSweepPlot })));
const MaterialExplorer = lazy(() => import("./MaterialExplorer").then((module) => ({ default: module.MaterialExplorer })));
const AdvancedAnalyses = lazy(() => import("./AdvancedAnalyses").then((module) => ({ default: module.AdvancedAnalyses })));

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
const studyPaneTabs = [
  { value: "wavelength", label: "Wavelength", id: "study-tab-wavelength", controlsId: "study-panel-wavelength" },
  { value: "geometry", label: "Geometry", id: "study-tab-geometry", controlsId: "study-panel-geometry" },
  { value: "bloch", label: "Bloch phase", id: "study-tab-bloch", controlsId: "study-panel-bloch" },
  { value: "analysis", label: "Advanced", id: "study-tab-analysis", controlsId: "study-panel-analysis" },
];
const BLOCH_PHASE_DISPLAY_DIGITS = 15;
const BLOCH_PHASE_STEP = Math.PI / 60;
const fieldComponents: FieldComponent[] = ["Ex", "Ey", "Ez", "intensity", "Hx", "Hy", "Hz", "poynting"];
type AppView = "solver" | "materials" | "sweeps" | "validation";
type ConfigurationTab = "geometry" | "materials" | "solver";
type StudyPane = "wavelength" | "geometry" | "bloch" | "analysis";
type WaveguideSession = {
  presetName: string;
  draft: WaveguideConfig;
  sweepSettings: SweepSettings;
  geometrySweep: GeometrySweepSettings;
  blochSweep: BlochSweepSettings;
  component: FieldComponent;
  fieldPart: FieldPart;
  displayInterpolation: DisplayInterpolation;
};
const appViews = [
  { id: "solver", label: "Setup", hint: "Geometry, materials and solver", icon: SettingsAdjust },
  { id: "materials", label: "Materials", hint: "Inspect optical data", icon: Chemistry },
  { id: "sweeps", label: "Studies", hint: "Track parameters", icon: ChartLine },
  { id: "validation", label: "Validation", hint: "Numerical confidence", icon: CheckmarkOutline },
] as const;

function WorkflowProgress({ activeView, busy, result, stale, hasIssues, error }: { activeView: AppView; busy: boolean; result?: SolverResult; stale: boolean; hasIssues: boolean; error: boolean }) {
  const currentIndex = error || busy
    ? 1
    : stale
      ? 2
      : result && (hasIssues || activeView === "validation")
        ? 3
        : result
          ? 2
          : 0;
  return <div className="workflow-progress">
    <ProgressIndicator aria-label="Waveguide solver workflow" currentIndex={currentIndex} spaceEqually>
      <ProgressStep label="Configure" description={result ? "Configuration retained" : "Cross-section and solver"} />
      <ProgressStep label="Execute" description={busy ? "Solving eigenproblem" : result ? "Solve complete" : "Select Solve modes"} invalid={error} />
      <ProgressStep label="Results" description={stale ? "Outdated · solve again" : result ? "Mode fields available" : "Awaiting solve"} invalid={stale} />
      <ProgressStep label="Validate" description={!result ? "Review after solve" : hasIssues ? "Warnings need review" : activeView === "validation" ? "Checks current" : "Numerical checks"} invalid={hasIssues} />
    </ProgressIndicator>
  </div>;
}

function ModeEvidence({ mode, result, validation }: { mode: WaveguideMode; result: SolverResult; validation: Array<{ label: string; pass: boolean }> }) {
  const degenerateCount = result.modes.filter((candidate) => Math.abs(candidate.effectiveIndex - mode.effectiveIndex) <= 1e-4).length;
  const checksPass = validation.every((check) => check.pass);
  const confidence = checksPass && !mode.nearCutoff && mode.residual < 2e-3 ? "High · checks passed" : "Review before quantitative use";
  return <section className={`solver-evidence-card${checksPass ? " solver-evidence-card--pass" : " solver-evidence-card--warning"}`} aria-labelledby="solver-evidence-title">
    <header className="solver-evidence-card__header">
      <div><span className="eyebrow">Scientific evidence</span><h3 id="solver-evidence-title">Selected mode confidence</h3></div>
      <strong>{confidence}</strong>
    </header>
    <dl className="solver-evidence-grid">
      <div><dt>Normalization</dt><dd>Modal power = 1.000 mW</dd></div>
      <div><dt>Mode</dt><dd>{mode.label} · {mode.polarization}</dd></div>
      <div><dt>Degenerate subspace</dt><dd>{degenerateCount} mode{degenerateCount === 1 ? "" : "s"} within Δn<sub>eff</sub> ≤ 10⁻⁴</dd></div>
      <div><dt>Eigenpair residual</dt><dd>{mode.residual.toExponential(2)}</dd></div>
      <div><dt>Condition estimate</dt><dd>{Number.isFinite(mode.eigenvalueConditionEstimate) ? mode.eigenvalueConditionEstimate.toExponential(2) : "—"}</dd></div>
      <div><dt>Energy metric</dt><dd>{mode.energyMetricValidity}</dd></div>
    </dl>
    <p className="solver-evidence-card__note">A near-degenerate subspace has a continuous span, but individual eigenvectors inside it are not unique. Near-cutoff, leaky and plasmonic modes require mesh, padding and boundary sensitivity checks.</p>
  </section>;
}

function viewFromHash(): AppView {
  const hash = window.location.hash.slice(1);
  if (hash === "analysis") return "sweeps";
  return appViews.some((view) => view.id === hash) ? hash as AppView : "solver";
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(() => typeof window === "undefined" ? "solver" : viewFromHash());
  const [sweepPane, setSweepPane] = useState<StudyPane>(() => typeof window !== "undefined" && window.location.hash === "#analysis" ? "analysis" : "wavelength");
  const [configurationTab, setConfigurationTab] = useState<ConfigurationTab>("geometry");
  const [presetName, setPresetName] = useState("SiN · channel");
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
  const [message, setMessage] = useState("Configure the cross-section, then select Solve modes.");
  const [sweepMessage, setSweepMessage] = useState("Choose a wavelength range to calculate dispersion.");
  const [geometrySweepMessage, setGeometrySweepMessage] = useState("Sweep a device dimension while tracking the selected mode.");
  const [blochSweepMessage, setBlochSweepMessage] = useState("Enable a periodic boundary to calculate transverse-array dispersion.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [primarySolveBusy, setPrimarySolveBusy] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(() => typeof window === "undefined" || viewFromHash() === "solver");
  const configureTriggerRef = useRef<HTMLButtonElement>(null);
  const configurationPanelRef = useRef<HTMLElement>(null);
  const platformPresetRef = useRef<HTMLSelectElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);
  const viewRefs = useRef<Partial<Record<AppView, HTMLElement | null>>>({});
  const mode = result ? (result.modes[selectedMode] ?? result.modes[0]) : undefined;
  const draftFingerprint = useMemo(() => JSON.stringify(draft), [draft]);
  const solvedFingerprint = useMemo(() => JSON.stringify(config), [config]);
  const selectedPreset = presets[presetName];
  const presetModified = Boolean(selectedPreset && draftFingerprint !== JSON.stringify(selectedPreset));
  const customConfiguration = selectedPreset === undefined;
  const resultIsStale = Boolean(result && draftFingerprint !== solvedFingerprint);
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
  const failedCheckCount = validation.filter((check) => !check.pass).length;
  const solverWarningCount = result?.warnings.length ?? 0;
  const evidenceSummary = [
    failedCheckCount > 0 ? `${failedCheckCount} failed ${failedCheckCount === 1 ? "check" : "checks"}` : "",
    solverWarningCount > 0 ? `${solverWarningCount} solver ${solverWarningCount === 1 ? "warning" : "warnings"}` : "",
  ].filter(Boolean).join(" · ");
  const resultHasIssues = failedCheckCount > 0 || solverWarningCount > 0;
  const solveStateLabel = busy ? "Solving" : resultIsStale ? `Stale${evidenceSummary ? ` · ${evidenceSummary}` : ""}` : result ? `Solved${evidenceSummary ? ` · ${evidenceSummary}` : ""}` : "Not solved";
  const settledEvidenceState = resultIsStale ? "modified" : resultHasIssues ? "warning" : result ? "up-to-date" : "ready";
  const evidenceState = busy ? "running" : settledEvidenceState;
  useScientificResultTransition({
    state: primarySolveBusy ? "running" : settledEvidenceState,
    resultRef: outcomeHeading,
    completionKey: result ? message : null,
    onReveal: () => { setActiveView("solver"); setNavigationOpen(false); },
  });
  const geometrySweepMaximum = geometrySweep.parameter === "bendRadiusUm" ? PARAMETER_MAXIMUMS.bendRadiusUm : PARAMETER_MAXIMUMS.dimensionUm;
  const session = useMemo<WaveguideSession>(() => ({
    presetName,
    draft,
    sweepSettings,
    geometrySweep,
    blochSweep,
    component,
    fieldPart,
    displayInterpolation,
  }), [blochSweep, component, displayInterpolation, draft, fieldPart, geometrySweep, presetName, sweepSettings]);
  const restoreSession = useCallback((saved: WaveguideSession) => {
    setPresetName(saved.presetName);
    setDraft(saved.draft);
    setSweepSettings(saved.sweepSettings);
    setGeometrySweep(saved.geometrySweep);
    setBlochSweep(saved.blochSweep);
    setComponent(saved.component);
    setFieldPart(saved.fieldPart);
    setDisplayInterpolation(saved.displayInterpolation);
    setResult(undefined);
    setSweepResult(undefined);
    setGeometrySweepResult(undefined);
    setBlochSweepResult(undefined);
    setMessage("Previous configuration restored. Solve modes to regenerate results.");
    setError("");
  }, []);
  const autosave = useScientificAutosave({
    storageKey: "waveguide-mode-solver:session",
    value: session,
    onRestore: restoreSession,
    schemaVersion: 1,
  });

  useEffect(() => {
    if (blochSweep.axis === "x" && !config.periodicX && config.periodicY) setBlochSweep((current) => ({ ...current, axis: "y" }));
    if (blochSweep.axis === "y" && !config.periodicY && config.periodicX) setBlochSweep((current) => ({ ...current, axis: "x" }));
  }, [blochSweep.axis, config.periodicX, config.periodicY]);

  useEffect(() => {
    const syncView = () => {
      const hash = window.location.hash;
      setActiveView(viewFromHash());
      if (hash === "#analysis") setSweepPane("analysis");
      else if (hash !== "#sweeps") setSweepPane("wavelength");
    };
    window.addEventListener("popstate", syncView);
    window.addEventListener("hashchange", syncView);
    return () => {
      window.removeEventListener("popstate", syncView);
      window.removeEventListener("hashchange", syncView);
    };
  }, []);

  useEffect(() => {
    let resizeFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      resizeFrame = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(resizeFrame); };
  }, [activeView, navigationOpen, sweepPane]);

  useEffect(() => {
    if (navigationOpen) configurationPanelRef.current?.scrollTo({ top: 0 });
  }, [configurationTab, navigationOpen]);

  const escapeShortcut = useMemo(() => ({
    id: "waveguide:close-or-cancel",
    shortcut: "Escape",
    displayKeys: ["Esc"],
    description: "Close configuration or cancel calculation",
    enabled: navigationOpen || busy,
    priority: 20,
    handler: () => {
      if (navigationOpen) {
        setNavigationOpen(false);
        window.requestAnimationFrame(() => configureTriggerRef.current?.focus());
      } else if (busy) cancelSolverWorker();
    },
  }), [busy, navigationOpen]);
  useScientificShortcut(escapeShortcut);

  function navigateToView(view: AppView) {
    window.history.pushState(null, "", `#${view}`);
    if (view === "solver" && activeView === "solver") setNavigationOpen((open) => !open);
    else {
      setActiveView(view);
      setNavigationOpen(view === "solver");
      window.requestAnimationFrame(() => viewRefs.current[view]?.focus());
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeConfiguration() {
    setNavigationOpen(false);
    window.requestAnimationFrame(() => configureTriggerRef.current?.focus());
  }

  function openConfiguration() {
    setNavigationOpen(true);
    window.requestAnimationFrame(() => platformPresetRef.current?.focus());
  }

  function updateNumber(key: keyof WaveguideConfig, value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (preset) { setPresetName(name); setDraft({ ...preset }); }
  }

  function resetPreset() {
    const preset = presets[presetName];
    if (!preset) return;
    setDraft({ ...preset });
    setMessage(`${presetName} values restored. Solve modes to apply them.`);
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

  async function runSolve() {
    if (busy) return;
    const errors = validateWaveguide(draft);
    if (errors.length > 0) { setError(errors.join(" ")); return; }
    setError("");
    setBusy(true);
    setPrimarySolveBusy(true);
    setMessage((draft.bendRadiusUm ?? 0) > 0
      ? `Solving a ${draft.gridResolution}-cell bent-waveguide eigenproblem with PML; fine meshes or several modes can take longer…`
      : draft.gridResolution > 96
        ? `Solving a high-resolution ${draft.gridResolution}-cell eigenproblem; this can take tens of seconds…`
        : "Solving the vector eigenproblem…");
    try {
        const next = await runSolverWorker<SolverResult>({ kind: "solve", config: draft }, ({ phase, progress }) => setMessage(`${phase} · ${Math.round(100 * progress)}%`));
        setConfig(draft);
        setResult(next);
        setSelectedMode(0);
        setSweepResult(undefined);
        setGeometrySweepResult(undefined);
        setBlochSweepResult(undefined);
        closeConfiguration();
        setGeometrySweep((current) => (
          (current.parameter === "slotGapUm" && (draft.geometry ?? "channel") !== "slot")
          || (current.parameter === "couplerGapUm" && (draft.geometry ?? "channel") !== "coupler")
          || (current.parameter === "bendRadiusUm" && (draft.bendRadiusUm ?? 0) <= 0)
            ? { ...current, parameter: "widthUm" } : current
        ));
        setBlochSweep((current) => ({ ...current, axis: draft.periodicX ? "x" : draft.periodicY ? "y" : current.axis }));
        setMessage(`${next.modes.length} guided mode${next.modes.length === 1 ? "" : "s"} found on a ${next.nx} × ${next.ny} Yee grid${draft.autoMeshBias ? ` with automatic x/y grading ${next.meshBiasX.toFixed(2)}/${next.meshBiasY.toFixed(2)}` : ""}.`);
    } catch (caught) {
        if (isSolverWorkerCancellation(caught)) setMessage("Calculation cancelled; previous results were kept.");
        else {
          setError(caught instanceof Error ? caught.message : "The mode solve failed.");
          setMessage("Solve failed.");
        }
    } finally {
      setPrimarySolveBusy(false);
      setBusy(false);
    }
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
        if (isSolverWorkerCancellation(caught)) setSweepMessage("Sweep cancelled; previous results were kept.");
        else {
          const detail = caught instanceof Error ? caught.message : "The wavelength sweep failed.";
          setError(detail);
          setSweepMessage(`Sweep failed: ${detail}`);
        }
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
      if (isSolverWorkerCancellation(caught)) setGeometrySweepMessage("Geometry sweep cancelled; previous results were kept.");
      else {
        const detail = caught instanceof Error ? caught.message : "The geometry sweep failed.";
        setError(detail);
        setGeometrySweepMessage(`Geometry sweep failed: ${detail}`);
      }
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
      if (isSolverWorkerCancellation(caught)) setBlochSweepMessage("Bloch sweep cancelled; previous results were kept.");
      else {
        const detail = caught instanceof Error ? caught.message : "The Bloch sweep failed.";
        setError(detail);
        setBlochSweepMessage(`Bloch sweep failed: ${detail}`);
      }
    } finally { setBusy(false); }
  }

  function exportField() {
    if (!mode || !result) return;
    const rows = [exportMetadata({ modeId: mode.id }), "x_um,y_um,Ex_real_V_m,Ex_imag_V_m,Ey_real_V_m,Ey_imag_V_m,Ez_real_V_m,Ez_imag_V_m,Hx_real_A_m,Hx_imag_A_m,Hy_real_A_m,Hy_imag_A_m,Hz_real_A_m,Hz_imag_A_m,E2_V2_m2,Sz_W_m2"];
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
    const filename = `waveguide-${config.geometry ?? "channel"}-${mode.id.toLowerCase()}-${config.wavelengthUm.toFixed(3)}um.csv`;
    download(rows.join("\n"), filename);
    setMessage(`Field data exported as ${filename}.`);
  }

  function exportSweep() {
    if (!sweepResult) return;
    const rows = [exportMetadata({ sweepSettings }), "wavelength_um,mode_label,near_cutoff,subspace_size,n_eff,n_group,dispersion_ps_nm_km,beta2_ps2_km,loss_db_cm,subspace_overlap",
      ...sweepResult.points.map((point) => [point.wavelengthUm, point.modeLabel, point.nearCutoff, point.degenerateSubspaceSize, point.effectiveIndex,
        point.groupIndex, point.dispersionPsPerNmKm, point.beta2Ps2PerKm, point.lossDbPerCm, point.overlap].join(","))];
    const filename = `waveguide-${config.geometry ?? "channel"}-dispersion.csv`;
    download(rows.join("\n"), filename);
    setSweepMessage(`Sweep exported as ${filename}.`);
  }

  function exportGeometrySweep() {
    if (!geometrySweepResult) return;
    const rows = [exportMetadata({ geometrySweep }), "value_um,mode_label,near_cutoff,subspace_size,n_eff,confinement,effective_area_um2,loss_db_cm,subspace_overlap",
      ...geometrySweepResult.points.map((point) => [point.valueUm, point.modeLabel, point.nearCutoff, point.degenerateSubspaceSize, point.effectiveIndex, point.electricConfinement,
        point.effectiveAreaUm2, point.lossDbPerCm, point.overlap].join(","))];
    const filename = `waveguide-${config.geometry ?? "channel"}-${geometrySweepResult.parameter}-sweep.csv`;
    download(rows.join("\n"), filename);
    setGeometrySweepMessage(`Sweep exported as ${filename}.`);
  }

  function exportBlochSweep() {
    if (!blochSweepResult) return;
    const rows = [exportMetadata({ blochSweep }), "phase_rad,phase_over_pi,mode_label,subspace_size,n_eff,n_eff_imag,loss_db_cm,subspace_overlap",
      ...blochSweepResult.points.map((point) => [point.phaseRad, point.phaseRad / Math.PI, point.modeLabel, point.degenerateSubspaceSize,
        point.effectiveIndex, point.effectiveIndexImaginary, point.lossDbPerCm, point.overlap].join(","))];
    const filename = `waveguide-${config.geometry ?? "channel"}-bloch-${blochSweepResult.axis}-sweep.csv`;
    download(rows.join("\n"), filename);
    setBlochSweepMessage(`Sweep exported as ${filename}.`);
  }

  function exportProject() {
    const exportedResult = result && !resultIsStale ? result : null;
    const project = {
      schemaVersion: 1,
      solverVersion: packageJson.version,
      exportedAt: new Date().toISOString(),
      config: draft,
      result: exportedResult,
      resultState: result ? resultIsStale ? "stale" : "current" : "not-solved",
      wavelengthSweep: resultIsStale ? null : sweepResult,
      geometrySweep: resultIsStale ? null : geometrySweepResult,
      blochSweep: resultIsStale ? null : blochSweepResult,
    };
    const filename = `waveguide-${draft.geometry ?? "channel"}-${draft.wavelengthUm.toFixed(3)}um-v${packageJson.version}.json`;
    download(JSON.stringify(project, null, 2), filename, "application/json;charset=utf-8");
    setMessage(resultIsStale
      ? `Project exported as ${filename} with the current draft. Stale solution and sweep results were not included.`
      : `Project exported as ${filename}.`);
  }

  function exportMetadata(details: object) {
    return `# metadata_json=${JSON.stringify({ solverVersion: packageJson.version, config, ...details })}`;
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
      setPresetName("Imported configuration");
      setError("");
      setMessage("Configuration imported. Solve to regenerate trusted results.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project file could not be imported.");
    }
  }

  return <ScientificAppShell
    className="waveguide-app"
    recovery={autosave.recovery && <ScientificRecoveryNotice savedAt={autosave.recovery.savedAt} onRestore={autosave.restore} onDiscard={autosave.discard} />}
    header={<>
      <h1 className="scientific-visually-hidden">Waveguide Mode Solver</h1>
      <ScientificHeader
      aria-label="Waveguide Mode Solver"
      product="Waveguide Solver"
      compactProduct="Modes"
      productIcon="waveguide"
      descriptor="Mode analysis"
      href="./"
      skipLink={<SkipToContent href="#scientific-workspace" />}
      contextLabel="Current configuration"
      context={`${presetName}${presetModified ? " · Modified" : ""}`}
      contextDetail={`${draft.widthUm.toFixed(2)} × ${draft.heightUm.toFixed(2)} µm · λ ${draft.wavelengthUm.toFixed(3)} µm`}
      status={{ state: evidenceState, label: solveStateLabel }}
      help={{
        summary: "Configure and solve the mode first. Use Sweeps and Analysis for sensitivity, then verify mesh and boundary convergence.",
        footer: <><Link href="https://jorpago2.github.io/">All tools</Link> · <Link href="https://github.com/jorpago2/waveguide-mode-solver" target="_blank" rel="noreferrer">Source code on GitHub</Link></>,
      }}
      primaryAction={<ScientificRunControl
        size="lg"
        execution={{
          state: evidenceState,
          label: solveStateLabel,
          onRun: runSolve,
          onStop: cancelSolverWorker,
          runLabel: "Solve",
          stopLabel: "Cancel",
        }}
      />}
      secondaryActions={<>
        <ScientificHeaderAction type="button" label="Export project" onClick={exportProject}><DocumentExport size={20} aria-hidden={true} /></ScientificHeaderAction>
        <ScientificHeaderAction type="button" label="Import project" onClick={() => projectImportRef.current?.click()}><DocumentImport size={20} aria-hidden={true} /></ScientificHeaderAction>
        <input ref={projectImportRef} hidden aria-label="Import project JSON" type="file" accept=".json,application/json" onChange={importProject} />
      </>}
      />
    </>}
    navigation={<ScientificToolRail
            className="tool-rail"
            label="Scientific workflow"
            activeId={activeView}
            expandedId={activeView === "solver" && navigationOpen ? "solver" : null}
            onChange={(id) => {
              if (id) navigateToView(id as AppView);
              else if (activeView === "solver" && navigationOpen) closeConfiguration();
            }}
            registerItemRef={(id, node) => { if (id === "solver") configureTriggerRef.current = node; }}
            items={appViews.map(({ id, label, icon: Icon }) => ({
              id,
              label,
              icon: <Icon size={20} />,
              controlsId: id === "solver" ? "configuration-panel" : id,
            }))}
          />}
    panelOpen={navigationOpen}
    panel={<ScientificTaskPanel
          ref={configurationPanelRef}
          className="control-panel"
          id="configuration-panel"
          title="Configuration"
          eyebrow="Mode solver"
          closeLabel="Close"
          onClose={closeConfiguration}
          actions={customConfiguration
            ? <IconIndicator kind="caution-minor" label="Custom" />
            : presetModified
              ? <><IconIndicator kind="caution-minor" label="Modified" /><Button type="button" kind="ghost" size="sm" onClick={resetPreset}>Reset preset</Button></>
              : undefined}
        >
          <form id="mode-solver-form" onSubmit={(event) => { event.preventDefault(); void runSolve(); }} noValidate aria-busy={busy}>
            <CarbonSelectField id="platform-preset" inputRef={platformPresetRef} label="Platform preset" value={presetName} options={Object.keys(presets).map((name) => ({ value: name, label: name }))} onChange={applyPreset} />
            <p className="configuration-summary">{draft.geometry ?? "channel"} · {draft.widthUm.toFixed(2)} × {draft.heightUm.toFixed(2)} µm · {materialDefinition(draft.coreMaterial ?? "custom").name} · λ {draft.wavelengthUm.toFixed(3)} µm · {draft.gridResolution} cells</p>
            <CrossSectionPreview config={draft} />
            <div className="configuration-tabs"><CarbonSwitcher label="Configuration sections" value={configurationTab} options={[{ value: "geometry", label: "Shape", id: "configuration-tab-geometry", controlsId: "configuration-geometry" }, { value: "materials", label: "Media", id: "configuration-tab-materials", controlsId: "configuration-materials" }, { value: "solver", label: "Solver", id: "configuration-tab-solver", controlsId: "configuration-solver" }]} onChange={(value) => setConfigurationTab(value as ConfigurationTab)} /></div>
            <section id="configuration-geometry" className="configuration-section" role="tabpanel" aria-labelledby="configuration-tab-geometry" hidden={configurationTab !== "geometry"}>
              <div className="configuration-heading"><h3>Cross-section</h3></div>
              <CarbonSelectField id="geometry" label="Geometry" value={draft.geometry ?? "channel"} options={[{ value: "channel", label: "Channel" }, { value: "rib", label: "Rib" }, { value: "slot", label: "Slot" }, { value: "coupler", label: "Two-guide coupler" }, { value: "multilayer", label: "Multilayer ridge" }, { value: "polygon", label: "Polygon regions" }]} onChange={(value) => setDraft((current) => {
                const geometry = value as GeometryType;
                return geometry === "polygon" ? { ...current, geometry, stackLayers: [], symmetryX: "none", symmetryY: "none", polygonRegions: current.polygonRegions?.length ? current.polygonRegions : [{
                  name: "Core", material: current.coreMaterial ?? "custom", index: current.coreIndex, extinction: current.coreExtinction ?? 0,
                  vertices: [{ xUm: -current.widthUm / 2, yUm: -current.heightUm / 2 }, { xUm: current.widthUm / 2, yUm: -current.heightUm / 2 }, { xUm: current.widthUm / 2, yUm: current.heightUm / 2 }, { xUm: -current.widthUm / 2, yUm: current.heightUm / 2 }],
                }] } : { ...current, geometry };
              })} />
              <div className="form-grid">
                <NumberField label={(draft.geometry ?? "channel") === "polygon" ? "Geometry span x" : (draft.geometry ?? "channel") === "coupler" ? "Guide width" : "Core width"} unit="µm" value={draft.widthUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("widthUm", v)} />
                <NumberField label={(draft.geometry ?? "channel") === "polygon" ? "Geometry span y" : "Core height"} unit="µm" value={draft.heightUm} min={0.05} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("heightUm", v)} />
                {(draft.geometry ?? "channel") === "rib" && <NumberField label="Slab height" unit="µm" value={draft.slabHeightUm ?? 0.15} min={0.01} max={Number.isFinite(draft.heightUm) ? draft.heightUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slabHeightUm", v)} />}
                {(draft.geometry ?? "channel") === "slot" && <NumberField label="Slot gap" unit="µm" value={draft.slotGapUm ?? 0.12} min={0.01} max={Number.isFinite(draft.widthUm) ? draft.widthUm : PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("slotGapUm", v)} />}
                {(draft.geometry ?? "channel") === "coupler" && <NumberField label="Coupler gap" unit="µm" value={draft.couplerGapUm ?? 0.2} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.01} onChange={(v) => updateNumber("couplerGapUm", v)} />}
                {!(["slot", "polygon"] as GeometryType[]).includes(draft.geometry ?? "channel") && <NumberField label="Sidewall angle" unit="°" value={draft.sidewallAngleDeg ?? 90} min={20} max={90} step={1} onChange={(v) => updateNumber("sidewallAngleDeg", v)} />}
                <CarbonSelectField id="propagation-path" label="Propagation path" value={(draft.bendRadiusUm ?? 0) > 0 ? "bend" : "straight"} options={[{ value: "straight", label: "Straight" }, { value: "bend", label: "Constant-radius bend" }]} onChange={(value) => setDraft((current) => value === "bend" ? { ...current, bendRadiusUm: current.bendRadiusUm && current.bendRadiusUm > 0 ? current.bendRadiusUm : 10, boundary: "pml" } : { ...current, bendRadiusUm: 0 })} />
                {(draft.bendRadiusUm ?? 0) > 0 && <>
                  <NumberField label="Bend radius" unit="µm" value={draft.bendRadiusUm ?? 10} min={0.1} max={PARAMETER_MAXIMUMS.bendRadiusUm} step={0.5} onChange={(v) => updateNumber("bendRadiusUm", v)} />
                  <CarbonSelectField id="bend-direction" label="Bend direction" value={draft.bendDirection ?? "positive-x"} options={[{ value: "positive-x", label: "Outer side at +x" }, { value: "negative-x", label: "Outer side at −x" }]} onChange={(value) => setDraft((current) => ({ ...current, bendDirection: value as "positive-x" | "negative-x" }))} />
                </>}
              </div>
              {(draft.geometry ?? "channel") === "polygon" && <Accordion className="advanced-controls"><AccordionItem title={`Polygon regions (${draft.polygonRegions?.length ?? 0})`} open>
                <p>Build arbitrary cross-sections from non-overlapping convex regions. Coordinates are relative to the cross-section centre.</p>
                <div className="stack-editor polygon-editor">
                  {(draft.polygonRegions ?? []).map((region, regionIndex) => <div className="stack-layer polygon-region" key={regionIndex}>
                    <TextInput id={`polygon-region-${regionIndex}-name`} labelText="Region name" size="sm" value={region.name} onChange={(event) => updatePolygonRegion(regionIndex, { name: event.target.value })} />
                    <MaterialSelect label="Material" value={region.material} allowTabulated={false} onChange={(material) => updatePolygonRegion(regionIndex, { material, index: displayMaterialIndex(material, draft.wavelengthUm, region.index, draft.materialTemperatureC) })} />
                    <NumberField label="Index" unit="n" value={displayPolygonIndex(region, draft)} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={region.material !== "custom"} onChange={(index) => updatePolygonRegion(regionIndex, { index })} />
                    <NumberField label="Extinction" unit="Im(n)" value={displayPolygonExtinction(region, draft)} min={0} max={PARAMETER_MAXIMUMS.extinction} step={0.000001} disabled={materialExtinctionIsReadOnly(region.material, draft.wavelengthUm)} onChange={(extinction) => updatePolygonRegion(regionIndex, { extinction })} />
                    <div className="polygon-vertices">
                      <strong>Vertices (x, y) in µm</strong>
                      {region.vertices.map((vertex, vertexIndex) => <div key={vertexIndex}>
                        <CarbonNumberField id={`polygon-${regionIndex}-vertex-${vertexIndex}-x`} label={`Vertex ${vertexIndex + 1} x`} unit="µm" value={vertex.xUm} min={-draft.widthUm / 2} max={draft.widthUm / 2} step={0.01} onChange={(value) => updatePolygonVertex(regionIndex, vertexIndex, "xUm", value)} />
                        <CarbonNumberField id={`polygon-${regionIndex}-vertex-${vertexIndex}-y`} label={`Vertex ${vertexIndex + 1} y`} unit="µm" value={vertex.yUm} min={-draft.heightUm / 2} max={draft.heightUm / 2} step={0.01} onChange={(value) => updatePolygonVertex(regionIndex, vertexIndex, "yUm", value)} />
                        <Button type="button" kind="danger--ghost" size="sm" disabled={region.vertices.length <= 3} onClick={() => updatePolygonRegion(regionIndex, { vertices: region.vertices.filter((_, index) => index !== vertexIndex) })}>Remove vertex {vertexIndex + 1}</Button>
                      </div>)}
                      <Button type="button" kind="tertiary" size="sm" disabled={region.vertices.length >= 32} onClick={() => {
                        const first = region.vertices[0]; const last = region.vertices[region.vertices.length - 1];
                        updatePolygonRegion(regionIndex, { vertices: [...region.vertices, { xUm: (first.xUm + last.xUm) / 2, yUm: (first.yUm + last.yUm) / 2 }] });
                      }}>Add vertex</Button>
                    </div>
                    <Button type="button" kind="danger--ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, polygonRegions: (current.polygonRegions ?? []).filter((_, index) => index !== regionIndex) }))}>Remove {region.name}</Button>
                  </div>)}
                </div>
                <div className="polygon-actions"><Button type="button" kind="tertiary" size="sm" onClick={addPolygonRegion} disabled={(draft.polygonRegions?.length ?? 0) >= 12}>Add region</Button><Button type="button" kind="tertiary" size="sm" onClick={() => download(JSON.stringify({ polygonRegions: draft.polygonRegions ?? [] }, null, 2), "waveguide-polygons.json", "application/json;charset=utf-8")}>Export JSON</Button><FileUploaderButton id="import-polygons" accept={[".json", "application/json"]} buttonKind="tertiary" size="sm" labelText="Import JSON" onChange={(event) => void importPolygons(event)} /></div>
              </AccordionItem></Accordion>}
              {(draft.geometry ?? "channel") !== "polygon" &&
              <Accordion className="advanced-controls"><AccordionItem title={`Vertical stack (${draft.stackLayers?.length ?? 0} layers)`}>
                <p>Finite layers are listed from the core downward; the base substrate continues below the final layer.</p>
                <div className="stack-editor">
                  {(draft.stackLayers ?? []).map((layer, index) => <div className="stack-layer" key={`${index}-${layer.name}`}>
                    <TextInput id={`stack-layer-${index}-name`} labelText="Layer name" size="sm" value={layer.name} onChange={(event) => updateStackLayer(index, { name: event.target.value })} />
                    <MaterialSelect label="Material" value={layer.material} allowTabulated={false} onChange={(material) => updateStackLayer(index, { material, index: displayMaterialIndex(material, draft.wavelengthUm, layer.index, draft.materialTemperatureC, layer.opticAxis) })} />
                    <NumberField label="Thickness" unit="µm" value={layer.thicknessUm} min={0.01} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.05} onChange={(value) => updateStackLayer(index, { thicknessUm: value })} />
                    <NumberField label="Index" unit="n" value={displayMaterialIndex(layer.material, draft.wavelengthUm, layer.index, draft.materialTemperatureC, layer.opticAxis)} min={0} max={PARAMETER_MAXIMUMS.refractiveIndex} step={0.001} disabled={layer.material !== "custom"} onChange={(value) => updateStackLayer(index, { index: value })} />
                    <Button type="button" kind="danger--ghost" size="sm" onClick={() => removeStackLayer(index)}>Remove {layer.name}</Button>
                  </div>)}
                </div>
                <Button type="button" kind="tertiary" size="sm" onClick={addStackLayer} disabled={(draft.stackLayers?.length ?? 0) >= 6}>Add layer</Button>
              </AccordionItem></Accordion>}
            </section>

            <section id="configuration-materials" className="configuration-section" role="tabpanel" aria-labelledby="configuration-tab-materials" hidden={configurationTab !== "materials"}>
              <div className="configuration-heading"><h3>Optical materials</h3></div>
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
              <Accordion className="advanced-controls"><AccordionItem title={(draft.geometry ?? "channel") === "polygon" ? "Cladding loss & dispersion" : "Anisotropy, loss & dispersion"}>
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
              </AccordionItem></Accordion>
            </section>

            <section id="configuration-solver" className="configuration-section" role="tabpanel" aria-labelledby="configuration-tab-solver" hidden={configurationTab !== "solver"}>
              <div className="configuration-heading"><h3>Numerical setup</h3></div>
              <div className="form-grid">
                <NumberField label="Wavelength" unit="µm" value={draft.wavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(v) => updateNumber("wavelengthUm", v)} />
                <NumberField label="Modes" unit="modes" value={draft.modeCount} min={1} max={PARAMETER_MAXIMUMS.modeCount} step={1} onChange={(v) => updateNumber("modeCount", v)} />
                <NumberField label="Resolution" unit="cells" value={draft.gridResolution} min={24} max={PARAMETER_MAXIMUMS.gridResolution} step={1} onChange={(v) => updateNumber("gridResolution", v)} />
                <NumberField label="Mesh bias" unit={draft.autoMeshBias ? "automatic" : `0–${PARAMETER_MAXIMUMS.meshBias}`} value={draft.meshBias ?? 0} min={0} max={PARAMETER_MAXIMUMS.meshBias} step={0.1} disabled={draft.autoMeshBias} onChange={(v) => updateNumber("meshBias", v)} />
                <NumberField label="Padding" unit="µm" value={draft.paddingUm} min={0.2} max={PARAMETER_MAXIMUMS.dimensionUm} step={0.1} onChange={(v) => updateNumber("paddingUm", v)} />
                <CarbonCheckboxField id="automatic-mesh-grading" label="Automatic mesh grading" checked={draft.autoMeshBias ?? false} onChange={(checked) => setDraft((current) => ({ ...current, autoMeshBias: checked }))} />
                <CarbonSelectField id="outer-boundary" label="Outer boundary" value={draft.boundary ?? "hard"} options={[{ value: "hard", label: "Hard wall" }, { value: "pml", label: "PML (open)" }]} onChange={(value) => setDraft((current) => ({ ...current, boundary: value as "hard" | "pml" }))} />
                <CarbonSelectField id="symmetry-x" label="x symmetry plane" value={draft.symmetryX ?? "none"} options={[{ value: "none", label: "None" }, { value: "pec", label: "PEC · tangential E = 0" }, { value: "pmc", label: "PMC · tangential H = 0" }]} onChange={(value) => setDraft((current) => ({ ...current, symmetryX: value as SymmetryBoundary, ...(value !== "none" ? { periodicX: false, periodicY: false, blochPhaseXRad: 0, blochPhaseYRad: 0 } : {}) }))} />
                <CarbonSelectField id="symmetry-y" label="y symmetry plane" value={draft.symmetryY ?? "none"} options={[{ value: "none", label: "None" }, { value: "pec", label: "PEC · tangential E = 0" }, { value: "pmc", label: "PMC · tangential H = 0" }]} onChange={(value) => setDraft((current) => ({ ...current, symmetryY: value as SymmetryBoundary, ...(value !== "none" ? { periodicX: false, periodicY: false, blochPhaseXRad: 0, blochPhaseYRad: 0 } : {}) }))} />
                {(draft.boundary ?? "hard") === "pml" && <>
                  <NumberField label="PML thickness" unit="µm" value={draft.pmlThicknessUm ?? draft.paddingUm * 0.6} min={0.01} max={Math.max(0.02, draft.paddingUm - 0.01)} step={0.05} onChange={(v) => updateNumber("pmlThicknessUm", v)} />
                  <NumberField label="PML strength" unit="σ" value={draft.pmlStrength ?? 4} min={0.1} max={50} step={0.5} onChange={(v) => updateNumber("pmlStrength", v)} />
                </>}
              </div>
              {draft.autoMeshBias && <p className="configuration-note">Automatic grading selects independent x/y center refinement from the core-to-domain span; geometry interfaces remain aligned explicitly.</p>}
              {((draft.symmetryX ?? "none") !== "none" || (draft.symmetryY ?? "none") !== "none") && <p className="configuration-note">Symmetry projects the full Yee operator onto the selected parity subspace. Use it only when the geometry and material tensor are mirror-symmetric.</p>}
              <Accordion className="advanced-controls"><AccordionItem title="Mode targeting">
                <div className="form-grid">
                  <NumberField label={<>Target Re(<i>n</i><sub>eff</sub>)</>} unit="0 = auto" value={draft.targetEffectiveIndex ?? 0} min={0} max={100} step={0.01} onChange={(value) => setDraft((current) => ({ ...current, targetEffectiveIndex: value > 0 ? value : undefined }))} />
                  <NumberField label={<>Target Im(<i>n</i><sub>eff</sub>)</>} unit="optional" value={draft.targetEffectiveIndexImaginary ?? 0} min={0} max={100} step={0.000001} disabled={draft.targetEffectiveIndex === undefined} onChange={(value) => setDraft((current) => ({ ...current, targetEffectiveIndexImaginary: value > 0 ? value : undefined }))} />
                </div>
                <p>The real target sets the shift used by the eigensolver. The imaginary target ranks complex candidates; it does not widen the physically admissible index window.</p>
              </AccordionItem></Accordion>
              <Accordion className="advanced-controls"><AccordionItem title="Bloch-periodic boundaries">
                <div className="form-grid">
                  <CarbonCheckboxField id="periodic-x" label="Periodic x pair" checked={draft.periodicX ?? false} onChange={(checked) => setDraft((current) => ({ ...current, periodicX: checked, ...(!checked ? { blochPhaseXRad: 0 } : {}), symmetryX: "none", symmetryY: "none", ...((checked && current.periodicY && current.boundary === "pml") ? { boundary: "hard" as const } : {}) }))} />
                  <CarbonCheckboxField id="periodic-y" label="Periodic y pair" checked={draft.periodicY ?? false} onChange={(checked) => setDraft((current) => ({ ...current, periodicY: checked, ...(!checked ? { blochPhaseYRad: 0 } : {}), symmetryX: "none", symmetryY: "none", ...((checked && current.periodicX && current.boundary === "pml") ? { boundary: "hard" as const } : {}) }))} />
                  {draft.periodicX && <NumberField label="Bloch phase x" unit="rad" value={draft.blochPhaseXRad ?? 0} min={-Math.PI} max={Math.PI} step={BLOCH_PHASE_STEP} displayDigits={BLOCH_PHASE_DISPLAY_DIGITS} onChange={(value) => updateNumber("blochPhaseXRad", value)} />}
                  {draft.periodicY && <NumberField label="Bloch phase y" unit="rad" value={draft.blochPhaseYRad ?? 0} min={-Math.PI} max={Math.PI} step={BLOCH_PHASE_STEP} displayDigits={BLOCH_PHASE_DISPLAY_DIGITS} onChange={(value) => updateNumber("blochPhaseYRad", value)} />}
                </div>
                <p>Opposite faces satisfy F(r + L) = F(r)e<sup>iθ</sup>. A zero phase is ordinary periodicity; PML remains active only along non-periodic axes. The full computational span is the lattice period, so Padding controls the separation between neighboring copies.</p>
              </AccordionItem></Accordion>
              <p className="configuration-note">Use the Analysis view for mesh and boundary convergence before interpreting quantitative results.</p>
            </section>
            <Button className="solve-button" kind={busy ? "danger" : "primary"} renderIcon={busy ? StopOutline : Play} type={busy ? "button" : "submit"} onClick={busy ? cancelSolverWorker : undefined}>{busy ? "Cancel calculation" : "Solve modes"}</Button>
            <InlineNotification className="status" kind="info" title="Solver status" subtitle={message} hideCloseButton lowContrast />{error && <InlineNotification kind="error" title="Solver error" subtitle={error} hideCloseButton lowContrast />}
          </form>
        </ScientificTaskPanel>}
    statusBar={<ScientificStatusBar className="waveguide-status" aria-label="Scientific status" status={{ state: evidenceState, label: solveStateLabel }} metadata={<>
      <ScientificAutosaveStatus status={autosave.status} savedAt={autosave.lastSavedAt} />
      <span>{config.geometry ?? "channel"}</span>
      <span>λ = {config.wavelengthUm.toFixed(3)} µm</span>
      {result && <><span>{result.modes.length} {result.modes.length === 1 ? "mode" : "modes"}</span><span>{result.nx} × {result.ny}</span>{failedCheckCount > 0 && <span>{failedCheckCount} failed</span>}{solverWarningCount > 0 && <span>{solverWarningCount} {solverWarningCount === 1 ? "warning" : "warnings"}</span>}</>}
    </>} />}
  >
    <WorkflowProgress activeView={activeView} busy={busy} result={result} stale={resultIsStale} hasIssues={resultHasIssues} error={Boolean(error)} />
    {resultIsStale && <InlineNotification kind="warning" title="Configuration changed" subtitle="Results, sweeps, validation and exports still use the last solved configuration." hideCloseButton lowContrast />}
    <div id="scientific-workspace" className="scientific-content" tabIndex={-1}>
      <section ref={(node) => { viewRefs.current.solver = node; }} className="app-view" id="solver" hidden={activeView !== "solver"} aria-label="Mode solver" tabIndex={-1}>
      <div id="mode-solver-workspace" className="workspace" tabIndex={-1}>
        <section className="results-panel scientific-stage" id="results-panel" aria-label="Mode result">
          <div className="result-stage">
          <ScientificOutcomeSummary
            className="waveguide-outcome"
            title={mode ? `${mode.label} mode outcome` : "Mode solve outcome"}
            headingRef={outcomeHeading}
            status={{ state: evidenceState, label: solveStateLabel, detail: busy ? message : undefined }}
            summary={mode
              ? resultIsStale
                ? "The displayed mode, sweeps and exports still use the last solved configuration. Solve again before quantitative interpretation."
                : mode.nearCutoff
                  ? "A mode was found near cutoff. Treat confinement and attenuation as provisional until mesh and boundary convergence are checked."
                  : "The selected guided mode is current. Review residual, mesh and boundary evidence before accepting quantitative values."
              : "Configure the cross-section and solve the eigenproblem to obtain the first guided-mode result."}
            metrics={mode ? [
              { id: "effective-index", label: "Effective index", value: mode.effectiveIndex, format: { significantDigits: 7 } },
              { id: "core-power", label: "Core power fraction", value: mode.corePowerFraction * 100, unit: "%", format: { significantDigits: 3 } },
              { id: "attenuation", label: "Total attenuation", value: mode.lossDbPerCm, unit: "dB/cm", format: { significantDigits: 3 }, status: mode.nearCutoff ? "warning" : "neutral" },
              { id: "relative-residual", label: "Relative residual", value: mode.residual, format: { significantDigits: 3 }, status: validation.every((check) => check.pass) ? "success" : "warning" },
            ] : []}
            actions={mode ? [
              { id: "export-field", label: "Export field CSV", emphasis: "primary", disabled: busy, onClick: exportField },
              { id: "solve-current", label: resultIsStale ? "Solve current setup" : "Solve again", emphasis: "secondary", collapseAt: "sm", disabled: busy, onClick: runSolve },
              { id: "export-project", label: "Export project", emphasis: "tertiary", overflowOnly: true, disabled: busy, onClick: exportProject },
            ] : [
              { id: "configure", label: "Review configuration", emphasis: "primary", onClick: openConfiguration },
              { id: "solve", label: "Solve modes", emphasis: "secondary", collapseAt: "sm", disabled: busy, onClick: runSolve },
            ]}
          />
          </div>
          {result ? <div className="result-stage">
            {mode && <ModeEvidence mode={mode} result={result} validation={validation} />}
            <div className="result-command-bar">
              <div className="result-view-switcher"><CarbonSwitcher label="Scientific result" value={resultView} options={[{ value: "mode", label: "Mode fields" }, { value: "geometry", label: "Structure & mesh" }]} onChange={(value) => setResultView(value as "mode" | "geometry")} /></div>
            </div>
            {resultView === "geometry" ? activeView === "solver" && <Suspense fallback={<VisualizationFallback />}><GeometryPlot config={config} result={result} mode={mode} /></Suspense> : mode ? <>
            <div className="mode-tabs"><CarbonSwitcher label="Guided modes" value={String(selectedMode)} options={result.modes.map((item, index) => ({ value: String(index), label: `${item.label} · ${item.polarization} · neff ${item.effectiveIndex.toFixed(5)}${item.nearCutoff ? " · near cutoff" : ""}` }))} onChange={(value) => setSelectedMode(Number(value))} /></div>
            <div className="field-control-bar">
              <div className="field-toolbar field-component-toolbar"><CarbonSelectField id="field-component" label="Field component" value={component} inline options={fieldComponents.map((field) => ({ value: field, label: (config.bendRadiusUm ?? 0) > 0 && field === "Ez" ? "Eθ" : (config.bendRadiusUm ?? 0) > 0 && field === "Hz" ? "Hθ" : field === "poynting" ? (config.bendRadiusUm ?? 0) > 0 ? "Sθ" : "Sz" : field === "intensity" ? "|E|²" : field }))} onChange={(value) => setComponent(value as FieldComponent)} /></div>
              <div className="field-toolbar field-part-toolbar">{component !== "intensity" && component !== "poynting" && <CarbonSwitcher label="Field display" value={fieldPart} options={[{ value: "real", label: "Re" }, { value: "imaginary", label: "Im" }, { value: "magnitude", label: "|·|" }, { value: "phase", label: "Phase" }]} onChange={(value) => setFieldPart(value as FieldPart)} />}<CarbonSelectField id="display-mesh" label="Mesh" value={String(displayInterpolation)} inline options={[{ value: "1", label: "Solver grid" }, { value: "2", label: "2× interpolated" }, { value: "4", label: "4× interpolated" }]} onChange={(value) => setDisplayInterpolation(Number(value) as DisplayInterpolation)} /></div>
            </div>
            {activeView === "solver" && <Suspense fallback={<VisualizationFallback />}><ModePlot component={component} part={fieldPart} config={config} mode={mode} xUm={result.xUm} yUm={result.yUm} displayInterpolation={displayInterpolation} /></Suspense>}
            <p className="plot-note">Field amplitudes are normalized to a modal power of 1 mW; they are not an absolute launched field. Use the displayed units and residual before comparing values across configurations.</p>
            <Accordion className="result-details"><AccordionItem title="Additional modal quantities">
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
            </AccordionItem></Accordion>
            </> : <ScientificEmptyState className="empty-state result-empty-state" icon={<Result size={32} />} title="No guided mode found" description="Inspect the mesh and structure, then increase the core size or index contrast." action={<Button className="empty-state-action" size="sm" type="button" onClick={openConfiguration}>Review configuration</Button>} />}
          </div> : null}
        </section>
      </div>
      </section>

      <section ref={(node) => { viewRefs.current.materials = node; }} className="app-view" id="materials" hidden={activeView !== "materials"} aria-labelledby="materials-title" tabIndex={-1}>
        <ViewHeading title="Material Explorer" id="materials-title" icon={<Chemistry size={20} aria-hidden={true} />} />
        {activeView === "materials" && <Suspense fallback={<VisualizationFallback />}><MaterialExplorer /></Suspense>}
      </section>

      <section ref={(node) => { viewRefs.current.sweeps = node; }} className="app-view" id="sweeps" hidden={activeView !== "sweeps"} aria-labelledby="sweeps-title" tabIndex={-1}>
      <ViewHeading title="Studies" id="sweeps-title" icon={<ChartLine size={20} aria-hidden={true} />} />
      <div className="section-tabs"><CarbonSwitcher label="Study type" value={sweepPane} options={studyPaneTabs} onChange={(value) => setSweepPane(value as StudyPane)} /></div>
      <section id="study-panel-wavelength" className="sweep-section tabbed-section" role="tabpanel" aria-labelledby="study-tab-wavelength" hidden={sweepPane !== "wavelength"}>
        <div className="panel-heading"><div><h2>Wavelength sweep</h2></div><Button kind="tertiary" size="sm" type="button" renderIcon={Download} disabled={!sweepResult} onClick={exportSweep}>Export CSV</Button></div>
          <form className="sweep-controls" onSubmit={runSweep} noValidate aria-busy={busy}>
          <NumberField label="Start wavelength" unit="µm" value={sweepSettings.startWavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(value) => setSweepSettings((current) => ({ ...current, startWavelengthUm: value }))} />
          <NumberField label="Stop wavelength" unit="µm" value={sweepSettings.stopWavelengthUm} min={0.2} max={PARAMETER_MAXIMUMS.wavelengthUm} step={0.01} onChange={(value) => setSweepSettings((current) => ({ ...current, stopWavelengthUm: value }))} />
          <NumberField label="Samples" unit="points" value={sweepSettings.points} min={5} max={PARAMETER_MAXIMUMS.sweepPoints} step={2} onChange={(value) => setSweepSettings((current) => ({ ...current, points: value }))} />
          <Button className="solve-button" kind={busy ? "danger" : "primary"} renderIcon={busy ? StopOutline : Play} type={busy ? "button" : "submit"} disabled={!busy && !mode} onClick={busy ? cancelSolverWorker : undefined}>{busy ? "Cancel calculation" : "Run sweep"}</Button>
        </form>
        <InlineNotification className="status" kind="info" title="Wavelength sweep" subtitle={sweepMessage} hideCloseButton lowContrast />
        {!sweepResult && <div className="tool-empty-state">The dispersion, group-index and loss traces will appear here after the sweep.</div>}
        {activeView === "sweeps" && sweepResult && <><Suspense fallback={<VisualizationFallback />}><SweepPlot result={sweepResult} /></Suspense><WarningMessages warnings={sweepResult.warnings} /></>}
      </section>

      <section id="study-panel-geometry" className="sweep-section tabbed-section" role="tabpanel" aria-labelledby="study-tab-geometry" hidden={sweepPane !== "geometry"}>
        <div className="panel-heading"><div><h2>Geometry sweep</h2></div><Button kind="tertiary" size="sm" type="button" renderIcon={Download} disabled={!geometrySweepResult} onClick={exportGeometrySweep}>Export CSV</Button></div>
          <form className="sweep-controls" onSubmit={runGeometrySweep} noValidate aria-busy={busy}>
          <CarbonSelectField id="geometry-sweep-parameter" label="Parameter" value={geometrySweep.parameter} options={[{ value: "widthUm", label: "Core width" }, { value: "heightUm", label: "Core height" }, ...((config.geometry ?? "channel") === "slot" ? [{ value: "slotGapUm", label: "Slot gap" }] : []), ...((config.geometry ?? "channel") === "coupler" ? [{ value: "couplerGapUm", label: "Coupler gap" }] : []), ...((config.bendRadiusUm ?? 0) > 0 ? [{ value: "bendRadiusUm", label: "Bend radius" }] : [])]} onChange={(value) => setGeometrySweep((current) => value === "bendRadiusUm" ? { ...current, parameter: "bendRadiusUm", startValueUm: 0.75 * (config.bendRadiusUm ?? 10), stopValueUm: 1.25 * (config.bendRadiusUm ?? 10) } : { ...current, parameter: value as GeometrySweepParameter })} />
          <NumberField label="Start value" unit="µm" value={geometrySweep.startValueUm} min={0.01} max={geometrySweepMaximum} step={0.01} onChange={(value) => setGeometrySweep((current) => ({ ...current, startValueUm: value }))} />
          <NumberField label="Stop value" unit="µm" value={geometrySweep.stopValueUm} min={0.01} max={geometrySweepMaximum} step={0.01} onChange={(value) => setGeometrySweep((current) => ({ ...current, stopValueUm: value }))} />
          <NumberField label="Samples" unit="points" value={geometrySweep.points} min={3} max={PARAMETER_MAXIMUMS.sweepPoints} step={1} onChange={(value) => setGeometrySweep((current) => ({ ...current, points: value }))} />
          <Button className="solve-button" kind={busy ? "danger" : "primary"} renderIcon={busy ? StopOutline : Play} type={busy ? "button" : "submit"} disabled={!busy && !mode} onClick={busy ? cancelSolverWorker : undefined}>{busy ? "Cancel calculation" : "Run sweep"}</Button>
        </form>
        <InlineNotification className="status" kind="info" title="Geometry sweep" subtitle={geometrySweepMessage} hideCloseButton lowContrast />
        {!geometrySweepResult && <div className="tool-empty-state">Tracked effective index and modal metrics will appear here after the sweep.</div>}
        {activeView === "sweeps" && geometrySweepResult && <><Suspense fallback={<VisualizationFallback />}><GeometrySweepPlot result={geometrySweepResult} /></Suspense><WarningMessages warnings={geometrySweepResult.warnings} /></>}
      </section>

      <section id="study-panel-bloch" className="sweep-section tabbed-section" role="tabpanel" aria-labelledby="study-tab-bloch" hidden={sweepPane !== "bloch"}>
        <div className="panel-heading"><div><h2>Transverse Bloch dispersion</h2></div><Button kind="tertiary" size="sm" type="button" renderIcon={Download} disabled={!blochSweepResult} onClick={exportBlochSweep}>Export CSV</Button></div>
        <p className="section-intro">Sweep the transverse Bloch phase of an infinite periodic array. All calculated eigenvalues are shown; the selected branch uses degenerate-subspace tracking.</p>
        <form className="sweep-controls" onSubmit={runBlochSweep} noValidate aria-busy={busy}>
          <CarbonSelectField
            id="bloch-axis"
            label="Periodic axis"
            value={blochSweep.axis}
            disabled={!config.periodicX && !config.periodicY}
            options={[
              { value: "x", label: "x boundary pair", disabled: !config.periodicX && config.periodicY },
              { value: "y", label: "y boundary pair", disabled: !config.periodicY && config.periodicX },
            ]}
            onChange={(value) => setBlochSweep((current) => ({ ...current, axis: value as BlochSweepAxis }))}
          />
          <NumberField label="Start phase" unit="rad" value={blochSweep.startPhaseRad} min={-Math.PI} max={Math.PI} step={BLOCH_PHASE_STEP} displayDigits={BLOCH_PHASE_DISPLAY_DIGITS} onChange={(value) => setBlochSweep((current) => ({ ...current, startPhaseRad: value }))} />
          <NumberField label="Stop phase" unit="rad" value={blochSweep.stopPhaseRad} min={-Math.PI} max={Math.PI} step={BLOCH_PHASE_STEP} displayDigits={BLOCH_PHASE_DISPLAY_DIGITS} onChange={(value) => setBlochSweep((current) => ({ ...current, stopPhaseRad: value }))} />
          <NumberField label="Samples" unit="points" value={blochSweep.points} min={3} max={PARAMETER_MAXIMUMS.sweepPoints} step={2} onChange={(value) => setBlochSweep((current) => ({ ...current, points: value }))} />
          <Button className="solve-button" kind={busy ? "danger" : "primary"} renderIcon={busy ? StopOutline : Play} type={busy ? "button" : "submit"} disabled={!busy && (!mode || (!config.periodicX && !config.periodicY))} onClick={busy ? cancelSolverWorker : undefined}>{busy ? "Cancel calculation" : "Run Bloch sweep"}</Button>
        </form>
        <InlineNotification className="status" kind="info" title="Bloch sweep" subtitle={blochSweepMessage} hideCloseButton lowContrast />
        {!blochSweepResult && <div className="tool-empty-state">Enable a periodic boundary to inspect the tracked Bloch branches.</div>}
        {activeView === "sweeps" && blochSweepResult && <><div className="analysis-metrics"><Metric label={<>Reciprocity max |n<sub>eff</sub>(θ) − n<sub>eff</sub>(−θ)|</>} value={blochSweepResult.reciprocityError === undefined ? "Not evaluated" : blochSweepResult.reciprocityError.toExponential(3)} /><Metric label="Tracked subspace" value={`${Math.max(...blochSweepResult.points.map((point) => point.degenerateSubspaceSize))} mode(s)`} /></div><Suspense fallback={<VisualizationFallback />}><BlochSweepPlot result={blochSweepResult} /></Suspense><WarningMessages warnings={blochSweepResult.warnings} /></>}
      </section>
      <section id="study-panel-analysis" className="sweep-section tabbed-section" role="tabpanel" aria-labelledby="study-tab-analysis" hidden={sweepPane !== "analysis"}>
        {activeView === "sweeps" && sweepPane === "analysis" && <Suspense fallback={<VisualizationFallback />}><AdvancedAnalyses key={JSON.stringify(config)} config={config} result={result} selectedMode={selectedMode} presets={presets} /></Suspense>}
      </section>
      </section>

      <section ref={(node) => { viewRefs.current.validation = node; }} className="app-view" id="validation" hidden={activeView !== "validation"} aria-labelledby="validation-title" tabIndex={-1}>
      <ViewHeading title="Validation" id="validation-title" icon={<CheckmarkOutline size={20} aria-hidden={true} />} />
      <section className={`validation-section${result ? "" : " validation-section-single"}`}>
        <ScientificModelScope
          model={(config.bendRadiusUm ?? 0) > 0 ? "Full-vector finite-difference eigenmode method with a radial coordinate transformation." : "Full-vector finite-difference eigenmode method with subpixel material averaging and geometry-aligned nonuniform differences."}
          assumptions={["Linear, local and non-magnetic materials", "Translational invariance along the propagation axis"]}
          limits={["Metallic bends and longitudinal periodicity are outside scope", "Nonlocal nanoscale response is excluded", "Quantitative use requires mesh and domain convergence"]}
        />
        {result && <div className="checks-card"><ScientificValidationSummary
          status={{ state: resultHasIssues ? "warning" : "up-to-date", label: solveStateLabel }}
          checks={validation.map((check, index) => ({ id: `mode-check-${index}`, label: check.label, state: check.pass ? "passed" : "warning" }))}
        />{mode && <dl className="solver-details"><div><dt>Numerical backend</dt><dd>{result.backend}</dd></div><div><dt>Mode classification</dt><dd>{mode.label} · {mode.physicalClass}</dd></div><div><dt>x/y field symmetry</dt><dd>{mode.symmetryX.toFixed(3)} / {mode.symmetryY.toFixed(3)}</dd></div><div><dt>Symmetry state reduction</dt><dd>{result.symmetryReductionFactor.toFixed(2)}×</dd></div>{(config.periodicX || config.periodicY) && <div><dt>Bloch cell / phase</dt><dd>{config.periodicX ? `x ${(result.xEdgesUm.at(-1)! - result.xEdgesUm[0]).toFixed(3)} µm, θ=${(config.blochPhaseXRad ?? 0).toFixed(3)}` : ""}{config.periodicX && config.periodicY ? " · " : ""}{config.periodicY ? `y ${(result.yEdgesUm.at(-1)! - result.yEdgesUm[0]).toFixed(3)} µm, θ=${(config.blochPhaseYRad ?? 0).toFixed(3)}` : ""}</dd></div>}<div><dt>Relative residual</dt><dd>{mode.residual.toExponential(2)}</dd></div><div><dt>Grid spacing range</dt><dd>{result.dxUm.toFixed(3)}–{result.dxMaxUm.toFixed(3)} µm</dd></div><div><dt>Longitudinal E fraction</dt><dd>{(mode.longitudinalElectricFraction * 100).toFixed(2)}%</dd></div><div><dt>Eₓ transverse fraction</dt><dd>{(mode.xPolarizedElectricFraction * 100).toFixed(2)}%</dd></div></dl>}<WarningMessages warnings={result.warnings} /></div>}
      </section>
      {mode && result && <section className="sweep-section validation-diagnostics">
        <div className="panel-heading"><div><h2>Complex-mode diagnostics</h2></div><Link href="https://github.com/jorpago2/waveguide-mode-solver/blob/main/REFERENCES.md" target="_blank" rel="noreferrer">References</Link></div>
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
        {mode.materialAbsorption.length > 0 && <div className="comparison-scroll"><CarbonTable title="Material absorption decomposition" headers={["Region", "Absorbed power per length", "Fraction"]} rows={mode.materialAbsorption.map((entry) => ({ id: entry.region, cells: [entry.region, `${entry.powerPerM.toExponential(4)} W/m`, `${(100 * entry.fraction).toFixed(2)}%`] }))} /></div>}
        <p className="limitation">Material absorption is obtained from the local Im(ε) field integral. Stored energy uses d(ω Re ε)/dω and is exact for lossless dispersion, a narrow-band approximation for weak loss, and diagnostic only for strongly absorptive media. PML classification is participation-based; establish leaky-mode loss with boundary and mesh convergence.</p>
        <div className="comparison-scroll"><CarbonTable className="candidate-table" title={<>Ritz candidates · target {result.searchTargetEffectiveIndex.toFixed(5)} · window {result.searchWindow.minimum.toFixed(5)}–{result.searchWindow.maximum.toFixed(5)}</>} headers={["Candidate", "Re(neff)", "Im(neff)", "Residual", "Status", "Reason"]} rows={result.candidates.map((candidate, index) => ({ id: `${candidate.effectiveIndex}-${candidate.effectiveIndexImaginary}-${index}`, cells: [candidate.label ?? `Ritz ${index + 1}`, candidate.effectiveIndex.toFixed(7), candidate.effectiveIndexImaginary.toExponential(3), candidate.residual.toExponential(2), <IconIndicator kind={candidate.status === "selected" || candidate.status === "available" ? "succeeded" : "incomplete"} label={candidate.status} />, candidate.reason] }))} /></div>
      </section>}
      </section>
    </div>
  </ScientificAppShell>;
}

function ViewHeading({ title, id, icon }: { title: string; id: string; icon: ReactNode }) {
  return <header className="view-heading"><div className="view-title">{icon}<h2 id={id}>{title}</h2></div></header>;
}

function VisualizationFallback() {
  return <InlineLoading description="Loading visualization…" />;
}

function NumberField({ label, unit, value, min, max, step, displayDigits, disabled = false, onChange }: { label: ReactNode; unit: string; value: number; min: number; max: number; step: number; displayDigits?: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <CarbonNumberField label={label} unit={unit} value={value} min={min} max={max} step={step} displayDigits={displayDigits} disabled={disabled} onChange={onChange} />;
}

function MaterialSelect({ label, value, allowTabulated = true, onChange }: { label: string; value: MaterialId; allowTabulated?: boolean; onChange: (value: MaterialId) => void }) {
  return <CarbonSelectField label={label} value={value} options={MATERIALS.filter((material) => allowTabulated || material.id !== "tabulated").map((material) => ({ value: material.id, label: material.name }))} onChange={(material) => onChange(material as MaterialId)} />;
}

function MaterialCsvInput({ region, table, onChange }: { region: string; table?: TabulatedMaterialData; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const range = table ? `${table.wavelengthUm[0]}–${table.wavelengthUm[table.wavelengthUm.length - 1]} µm · ${table.wavelengthUm.length} rows` : "wavelength_um,n,k";
  return <div className="material-csv-input"><FileUploaderButton id={`material-${region.toLowerCase()}-csv`} accept={[".csv", "text/csv"]} buttonKind="tertiary" size="sm" labelText={`${region} CSV · ${table?.name ?? "Choose file"}`} onChange={onChange} /><small>{range}</small></div>;
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
  return <p className="material-sources">Models: {selected.map((material, index) => <span key={material.id}>{index > 0 && " · "}{material.sourceUrl ? <Link href={material.sourceUrl} target="_blank" rel="noreferrer">{material.sourceLabel}</Link> : material.name} ({material.minimumWavelengthUm}–{material.maximumWavelengthUm} µm)</span>)}{imported.map((table) => <span key={table.name}> · {table.name} ({table.wavelengthUm[0]}–{table.wavelengthUm[table.wavelengthUm.length - 1]} µm)</span>)}</p>;
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

function Metric({ label, value }: { label: ReactNode; value: string }) { return <Tile className="metric"><span>{label}</span><strong>{value}</strong></Tile>; }

function WarningMessages({ warnings }: { warnings: string[] }) {
  return <>{warnings.map((warning) => <InlineNotification kind="warning" title="Review" subtitle={warning} hideCloseButton lowContrast key={warning} />)}</>;
}


function download(content: string, filename: string, mimeType = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
