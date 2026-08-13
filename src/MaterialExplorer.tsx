import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Tile } from "@carbon/react";
import Plotly from "plotly.js-cartesian-dist-min";
import { CarbonNumberField, CarbonSelectField } from "./CarbonControls";
import { PLOT_AXIS, PLOT_CONFIG, PLOT_FONT } from "./plotConfig";
import {
  MATERIALS, evaluateMaterialExtinction, evaluateMaterialPrincipalIndices, materialDefinition,
  type BuiltInMaterialId,
} from "./materials";

const MATERIAL_SAMPLES = 1000;
const explorableMaterials = MATERIALS.filter((material): material is typeof material & { id: BuiltInMaterialId } => (
  material.id !== "custom" && material.id !== "tabulated" && material.id !== "air"
));

export function MaterialExplorer() {
  const [materialId, setMaterialId] = useState<BuiltInMaterialId>("silicon");
  const definition = materialDefinition(materialId);
  const [wavelengthUm, setWavelengthUm] = useState(1.55);
  const refractiveIndexPlotRef = useRef<HTMLDivElement>(null);
  const permittivityPlotRef = useRef<HTMLDivElement>(null);
  const dispersionPlotRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => sampleMaterial(materialId), [materialId]);
  const current = useMemo(() => {
    const index = evaluateMaterialPrincipalIndices(materialId, wavelengthUm);
    const k = evaluateMaterialExtinction(materialId, wavelengthUm);
    return { ...index, k, epsilonReal: index.ordinary ** 2 - (k ?? 0) ** 2, epsilonImaginary: k === undefined ? undefined : 2 * index.ordinary * k };
  }, [materialId, wavelengthUm]);

  useEffect(() => {
    const refractiveIndexPlot = refractiveIndexPlotRef.current;
    const permittivityPlot = permittivityPlotRef.current;
    const dispersionPlot = dispersionPlotRef.current;
    if (!refractiveIndexPlot || !permittivityPlot || !dispersionPlot) return;

    const axis = PLOT_AXIS;
    const refractiveIndexTraces: Plotly.Data[] = [
      { type: "scatter", mode: "lines", name: "n<sub>o</sub>", x: data.wavelength, y: data.ordinary, line: { color: "#0072b2", width: 2.5 }, hovertemplate: "λ = %{x:.4g} µm<br>n<sub>o</sub> = %{y:.6g}<extra></extra>" },
      ...(definition.anisotropic ? [{ type: "scatter", mode: "lines", name: "n<sub>e</sub>", x: data.wavelength, y: data.extraordinary, line: { color: "#009e73", width: 2, dash: "dash" }, hovertemplate: "λ = %{x:.4g} µm<br>n<sub>e</sub> = %{y:.6g}<extra></extra>" } as Plotly.Data] : []),
      ...(definition.metallic || definition.lossRanges ? [{ type: "scatter", mode: "lines", name: "k", x: data.wavelength, y: data.extinction, yaxis: "y2", line: { color: "#cc79a7", width: 2 }, hovertemplate: "λ = %{x:.4g} µm<br>k = %{y:.4g}<extra></extra>" } as Plotly.Data] : []),
    ];
    const permittivityTraces: Plotly.Data[] = [
      { type: "scatter", mode: "lines", name: "Re(ε)", x: data.wavelength, y: data.epsilonReal, line: { color: "#0072b2", width: 2.5 }, hovertemplate: "λ = %{x:.4g} µm<br>Re(ε) = %{y:.6g}<extra></extra>" },
      ...(definition.metallic || definition.lossRanges ? [{ type: "scatter", mode: "lines", name: "Im(ε)", x: data.wavelength, y: data.epsilonImaginary, line: { color: "#d55e00", width: 2, dash: "dash" }, hovertemplate: "λ = %{x:.4g} µm<br>Im(ε) = %{y:.4g}<extra></extra>" } as Plotly.Data] : []),
    ];
    const dispersionTraces: Plotly.Data[] = [
      { type: "scatter", mode: "lines", name: "dn<sub>o</sub>/dλ", x: data.wavelength, y: data.derivativeOrdinary, line: { color: "#009e73", width: 2.5 }, hovertemplate: "λ = %{x:.4g} µm<br>dn<sub>o</sub>/dλ = %{y:.5g} µm<sup>−1</sup><extra></extra>" },
      ...(definition.anisotropic ? [{ type: "scatter", mode: "lines", name: "dn<sub>e</sub>/dλ", x: data.wavelength, y: data.derivativeExtraordinary, line: { color: "#d55e00", width: 2, dash: "dash" }, hovertemplate: "λ = %{x:.4g} µm<br>dn<sub>e</sub>/dλ = %{y:.5g} µm<sup>−1</sup><extra></extra>" } as Plotly.Data] : []),
    ];

    const commonLayout: Partial<Plotly.Layout> = {
      autosize: true,
      margin: { l: 64, r: 64, t: 84, b: 56 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: PLOT_FONT,
      legend: { orientation: "h", x: 0, y: 1.08 },
      uirevision: materialId,
      xaxis: { ...axis, title: { text: "Wavelength (µm)" } },
      shapes: [probeWavelengthShape(wavelengthUm)],
    };

    void Plotly.react(refractiveIndexPlot, refractiveIndexTraces, {
      ...commonLayout,
      yaxis: { ...axis, title: { text: "Refractive index" } },
      yaxis2: { ...axis, title: { text: "k" }, overlaying: "y", side: "right", type: "log", showgrid: false },
    }, plotConfig("material-refractive-index"));
    void Plotly.react(permittivityPlot, permittivityTraces, {
      ...commonLayout,
      yaxis: { ...axis, title: { text: "Permittivity" } },
    }, plotConfig("material-permittivity"));
    void Plotly.react(dispersionPlot, dispersionTraces, {
      ...commonLayout,
      yaxis: { ...axis, title: { text: "dn/dλ (µm<sup>−1</sup>)" } },
    }, plotConfig("material-dispersion"));

  }, [data, definition, wavelengthUm]);

  useEffect(() => {
    const plots = [refractiveIndexPlotRef.current, permittivityPlotRef.current, dispersionPlotRef.current];
    return () => plots.forEach((plot) => { if (plot) Plotly.purge(plot); });
  }, []);

  const selectMaterial = (id: BuiltInMaterialId) => {
    const next = materialDefinition(id);
    setMaterialId(id);
    setWavelengthUm(Math.min(next.maximumWavelengthUm, Math.max(next.minimumWavelengthUm, wavelengthUm)));
  };

  return <section className="sweep-section material-explorer">
    <aside className="material-explorer-controls">
      <CarbonSelectField label="Material" value={materialId} options={explorableMaterials.map((material) => ({ value: material.id, label: material.name }))} onChange={(value) => selectMaterial(value as BuiltInMaterialId)} />
      <CarbonNumberField label="Probe wavelength" unit="µm" value={wavelengthUm} min={definition.minimumWavelengthUm} max={definition.maximumWavelengthUm} step={0.001} onChange={(value) => Number.isFinite(value) && setWavelengthUm(Math.min(definition.maximumWavelengthUm, Math.max(definition.minimumWavelengthUm, value)))} />
      <dl className="material-readouts">
        <div><dt>n<sub>o</sub></dt><dd>{format(current.ordinary)}</dd></div>
        {definition.anisotropic && <div><dt>n<sub>e</sub></dt><dd>{format(current.extraordinary)}</dd></div>}
        <div><dt>k</dt><dd>{current.k === undefined ? "not modelled" : format(current.k)}</dd></div>
        <div><dt>ε</dt><dd>{format(current.epsilonReal)}{current.epsilonImaginary === undefined ? "" : ` + ${format(current.epsilonImaginary)}i`}</dd></div>
      </dl>
    </aside>
    <div className="material-plots">
      <figure className="material-figure">
        <figcaption>Refractive index and extinction</figcaption>
        <div ref={refractiveIndexPlotRef} className="material-plot" aria-label="Material refractive index and extinction plot" />
      </figure>
      <figure className="material-figure">
        <figcaption>Complex permittivity</figcaption>
        <div ref={permittivityPlotRef} className="material-plot" aria-label="Material complex permittivity plot" />
      </figure>
      <figure className="material-figure">
        <figcaption>Material dispersion</figcaption>
        <div ref={dispersionPlotRef} className="material-plot" aria-label="Material refractive-index dispersion plot" />
      </figure>
    </div>
    <Tile className="material-model-note">
      <strong>{definition.formula}</strong>
      <span>Validity: {definition.minimumWavelengthUm}–{definition.maximumWavelengthUm} µm</span>
      <span>{definition.lossModel ? `${definition.lossModel}: ${definition.lossRanges?.map(([minimum, maximum]) => `${minimum}–${maximum} µm`).join(", ")}` : "No built-in extinction model; use measured n,k data for loss."}</span>
      <span className="material-source-links">{definition.sourceUrl && <Link href={definition.sourceUrl} target="_blank" rel="noreferrer">{definition.sourceLabel ?? "Primary source"} ↗</Link>}{definition.lossSources?.map((source) => <Link href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.label} ↗</Link>)}</span>
    </Tile>
  </section>;
}

function sampleMaterial(materialId: BuiltInMaterialId) {
  const definition = materialDefinition(materialId);
  const wavelength = Array.from({ length: MATERIAL_SAMPLES }, (_, index) => definition.minimumWavelengthUm
    + index * (definition.maximumWavelengthUm - definition.minimumWavelengthUm) / (MATERIAL_SAMPLES - 1));
  const indices = wavelength.map((value) => evaluateMaterialPrincipalIndices(materialId, value));
  const extinction = wavelength.map((value) => evaluateMaterialExtinction(materialId, value) ?? null);
  const derivative = (values: number[]) => values.map((_, index) => {
    const lower = Math.max(0, index - 1); const upper = Math.min(values.length - 1, index + 1);
    return (values[upper] - values[lower]) / (wavelength[upper] - wavelength[lower]);
  });
  const ordinary = indices.map((value) => value.ordinary);
  const extraordinary = indices.map((value) => value.extraordinary);
  return {
    wavelength, ordinary, extraordinary, extinction,
    epsilonReal: ordinary.map((n, index) => n ** 2 - (extinction[index] ?? 0) ** 2),
    epsilonImaginary: ordinary.map((n, index) => extinction[index] === null ? null : 2 * n * extinction[index]),
    derivativeOrdinary: derivative(ordinary), derivativeExtraordinary: derivative(extraordinary),
  };
}

function format(value: number): string {
  return Math.abs(value) < 1e-3 && value !== 0 ? value.toExponential(3) : value.toPrecision(6);
}

function probeWavelengthShape(wavelengthUm: number): Partial<Plotly.Shape> {
  return {
    type: "line",
    xref: "x",
    yref: "paper",
    x0: wavelengthUm,
    x1: wavelengthUm,
    y0: 0,
    y1: 1,
    line: { color: "rgba(25,49,58,0.35)", width: 1, dash: "dot" },
  };
}

function plotConfig(filename: string): Partial<Plotly.Config> {
  return {
    ...PLOT_CONFIG,
    modeBarButtonsToRemove: [...(PLOT_CONFIG.modeBarButtonsToRemove ?? []), "zoomIn2d", "zoomOut2d"],
    toImageButtonOptions: {
      ...PLOT_CONFIG.toImageButtonOptions,
      filename,
    },
  };
}
