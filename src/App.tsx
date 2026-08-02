import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ModePlot } from "./ModePlot";
import {
  solveWaveguide,
  validateWaveguide,
  type FieldComponent,
  type SolverResult,
  type WaveguideConfig,
} from "./solver";

const presets: Record<string, WaveguideConfig> = {
  "Silicon nitride": {
    wavelengthUm: 1.55,
    widthUm: 1,
    heightUm: 0.4,
    coreIndex: 2,
    claddingIndex: 1.444,
    paddingUm: 1.2,
    gridResolution: 40,
    modeCount: 3,
  },
  Silicon: {
    wavelengthUm: 1.55,
    widthUm: 0.45,
    heightUm: 0.22,
    coreIndex: 3.476,
    claddingIndex: 1.444,
    paddingUm: 0.8,
    gridResolution: 52,
    modeCount: 2,
  },
  Polymer: {
    wavelengthUm: 1.55,
    widthUm: 2,
    heightUm: 1.2,
    coreIndex: 1.59,
    claddingIndex: 1.49,
    paddingUm: 2,
    gridResolution: 44,
    modeCount: 3,
  },
};

const initialConfig = presets["Silicon nitride"];
const fieldComponents: FieldComponent[] = ["Ex", "Ey", "Ez", "Hx", "Hy", "Hz", "intensity"];
const fieldLabels: Record<FieldComponent, ReactNode> = {
  Ex: <>E<sub>x</sub></>,
  Ey: <>E<sub>y</sub></>,
  Ez: <>E<sub>z</sub></>,
  Hx: <>H<sub>x</sub></>,
  Hy: <>H<sub>y</sub></>,
  Hz: <>H<sub>z</sub></>,
  intensity: "|E|²",
};

export function App() {
  const [draft, setDraft] = useState<WaveguideConfig>(initialConfig);
  const [config, setConfig] = useState<WaveguideConfig>(initialConfig);
  const [result, setResult] = useState<SolverResult>(() => solveWaveguide(initialConfig));
  const [selectedMode, setSelectedMode] = useState(0);
  const [component, setComponent] = useState<FieldComponent>("Ex");
  const [message, setMessage] = useState("Full-vector solution ready.");
  const [error, setError] = useState("");
  const mode = result.modes[selectedMode] ?? result.modes[0];
  const validation = useMemo(() => mode ? [
    { label: "Index bounds", pass: mode.effectiveIndex > config.claddingIndex && mode.effectiveIndex < config.coreIndex },
    { label: "Eigenpair residual", pass: mode.residual < 2e-3 },
    { label: "Core sampled", pass: Math.min(config.widthUm / result.dxUm, config.heightUm / result.dyUm) >= 8 },
  ] : [], [config, mode, result]);

  function updateNumber(key: keyof WaveguideConfig, value: string) {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (preset) setDraft(preset);
  }

  function solve(event: FormEvent) {
    event.preventDefault();
    const errors = validateWaveguide(draft);
    if (errors.length > 0) {
      setError(errors.join(" "));
      return;
    }
    setError("");
    setMessage("Solving the vector eigenproblem…");
    window.setTimeout(() => {
      try {
        const nextResult = solveWaveguide(draft);
        setConfig(draft);
        setResult(nextResult);
        setSelectedMode(0);
        setMessage(`${nextResult.modes.length} guided mode${nextResult.modes.length === 1 ? "" : "s"} found on a ${nextResult.nx} × ${nextResult.ny} Yee grid.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The mode solve failed.");
        setMessage("Solve failed.");
      }
    }, 20);
  }

  function exportField() {
    if (!mode) return;
    const rows = ["x_um,y_um,Ex,Ey,Ez,Hx,Hy,Hz,normalized_E2"];
    for (let row = 0; row < result.yUm.length; row += 1) {
      for (let column = 0; column < result.xUm.length; column += 1) {
        rows.push([
          result.xUm[column],
          result.yUm[row],
          mode.fields.Ex[row][column],
          mode.fields.Ey[row][column],
          mode.fields.Ez[row][column],
          mode.fields.Hx[row][column],
          mode.fields.Hy[row][column],
          mode.fields.Hz[row][column],
          mode.fields.intensity[row][column],
        ].join(","));
      }
    }
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `waveguide-${mode.id.toLowerCase()}-${config.wavelengthUm.toFixed(3)}um.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="./" aria-label="Waveguide Mode Solver home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Waveguide Mode Solver</span>
        </a>
        <div className="header-meta">
          <span>Full-vector FDM</span>
          <a href="https://github.com/jorpago2/waveguide-mode-solver" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Integrated photonics · educational solver</p>
          <h1 id="page-title">Inspect the complete vector field of guided modes.</h1>
          <p>Calculate hybrid modes of isotropic dielectric waveguides on a transverse Yee grid. Compare all six field components, confinement, polarization and effective index directly in the browser.</p>
        </section>

        <div className="workspace">
          <aside className="control-panel">
            <div className="panel-heading">
              <div><span className="step">01</span><h2>Waveguide</h2></div>
              <span className="method-chip">FDM</span>
            </div>
            <form onSubmit={solve} noValidate>
              <label>
                Platform preset
                <select defaultValue="Silicon nitride" onChange={(event) => applyPreset(event.target.value)}>
                  {Object.keys(presets).map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
              <div className="form-grid">
                <NumberField label="Wavelength" unit="µm" value={draft.wavelengthUm} min={0.2} max={20} step={0.01} onChange={(value) => updateNumber("wavelengthUm", value)} />
                <NumberField label="Core width" unit="µm" value={draft.widthUm} min={0.05} max={20} step={0.01} onChange={(value) => updateNumber("widthUm", value)} />
                <NumberField label="Core height" unit="µm" value={draft.heightUm} min={0.05} max={20} step={0.01} onChange={(value) => updateNumber("heightUm", value)} />
                <NumberField label="Cladding padding" unit="µm" value={draft.paddingUm} min={0.2} max={20} step={0.1} onChange={(value) => updateNumber("paddingUm", value)} />
                <NumberField label="Core index" unit="n" value={draft.coreIndex} min={1.01} max={6} step={0.001} onChange={(value) => updateNumber("coreIndex", value)} />
                <NumberField label="Cladding index" unit="n" value={draft.claddingIndex} min={1} max={5} step={0.001} onChange={(value) => updateNumber("claddingIndex", value)} />
                <NumberField label="Grid resolution" unit="cells" value={draft.gridResolution} min={24} max={64} step={1} onChange={(value) => updateNumber("gridResolution", value)} />
                <NumberField label="Requested modes" unit="modes" value={draft.modeCount} min={1} max={4} step={1} onChange={(value) => updateNumber("modeCount", value)} />
              </div>
              <button className="solve-button" type="submit">Solve modes <span aria-hidden="true">→</span></button>
              <p className="status" aria-live="polite">{message}</p>
              {error && <p className="error" role="alert">{error}</p>}
            </form>
          </aside>

          <section className="results-panel" aria-labelledby="results-title">
            <div className="panel-heading results-heading">
              <div><span className="step">02</span><h2 id="results-title">Mode explorer</h2></div>
              <button className="export-button" type="button" onClick={exportField} disabled={!mode}>Export CSV</button>
            </div>

            {mode ? <>
              <div className="mode-tabs" role="tablist" aria-label="Guided modes">
                {result.modes.map((item, index) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedMode === index}
                    className={selectedMode === index ? "active" : ""}
                    key={`${item.id}-${index}`}
                    onClick={() => setSelectedMode(index)}
                  >
                    <span>{item.polarization}</span>
                    <small><i>n</i><sub>eff</sub> {item.effectiveIndex.toFixed(5)}</small>
                  </button>
                ))}
              </div>

              <div className="metrics">
                <Metric label={<>Effective index <i>n</i><sub>eff</sub></>} value={mode.effectiveIndex.toFixed(6)} />
                <Metric label={<>Propagation constant β</>} value={`${mode.propagationConstantPerUm.toFixed(4)} µm⁻¹`} />
                <Metric label="Electric confinement" value={`${(mode.electricConfinement * 100).toFixed(1)}%`} />
                <Metric label={<>Effective area <i>A</i><sub>eff</sub></>} value={`${mode.effectiveAreaUm2.toFixed(3)} µm²`} />
              </div>

              <div className="field-toolbar" aria-label="Field component">
                <span>Field</span>
                {fieldComponents.map((field) => (
                  <button type="button" className={component === field ? "active" : ""} aria-pressed={component === field} key={field} onClick={() => setComponent(field)}>
                    {fieldLabels[field]}
                  </button>
                ))}
              </div>
              <ModePlot component={component} config={config} mode={mode} xUm={result.xUm} yUm={result.yUm} />
            </> : <div className="empty-state">No guided mode was found. Increase the core size or index contrast.</div>}
          </section>
        </div>

        <section className="validation-section">
          <div className="method-card">
            <p className="eyebrow">Numerical model</p>
            <h2>Full-vector finite-difference eigenmode method</h2>
            <p>The solver discretizes Maxwell’s equations on a transverse Yee grid and solves the coupled eigenproblem for <i>H</i><sub>x</sub> and <i>H</i><sub>y</sub>. The longitudinal fields and electric components are reconstructed from the discrete curl relations.</p>
            <div className="equation" aria-label="U times transverse H equals beta squared times transverse H">
              <span>U</span><b>H</b><sub>t</sub><span>=</span><i>β</i><sup>2</sup><b>H</b><sub>t</sub>
            </div>
            <p className="limitation">Scope: linear, isotropic, non-magnetic and lossless dielectrics with hard outer boundaries. Increase padding and grid resolution to check boundary and mesh convergence.</p>
          </div>
          <div className="checks-card">
            <p className="eyebrow">Current solution</p>
            <h2>Validation checks</h2>
            <div className="checks">
              {validation.map((check) => (
                <div key={check.label}><span className={check.pass ? "pass" : "warn"}>{check.pass ? "Pass" : "Review"}</span><strong>{check.label}</strong></div>
              ))}
            </div>
            {mode && <dl className="solver-details">
              <div><dt>Relative residual</dt><dd>{mode.residual.toExponential(2)}</dd></div>
              <div><dt>Grid spacing</dt><dd>{result.dxUm.toFixed(3)} × {result.dyUm.toFixed(3)} µm</dd></div>
              <div><dt>Longitudinal E fraction</dt><dd>{(mode.longitudinalElectricFraction * 100).toFixed(2)}%</dd></div>
              <div><dt>Eₓ transverse fraction</dt><dd>{(mode.xPolarizedElectricFraction * 100).toFixed(2)}%</dd></div>
            </dl>}
            {result.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
          </div>
        </section>
      </main>

      <footer>
        <span>Waveguide Mode Solver</span>
        <span>Built for photonics education · Results require convergence checks for design use.</span>
      </footer>
    </div>
  );
}

function NumberField({ label, unit, value, min, max, step, onChange }: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: string) => void;
}) {
  return <label className="number-field">
    <span>{label}</span>
    <div><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} /><small>{unit}</small></div>
  </label>;
}

function Metric({ label, value }: { label: ReactNode; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
