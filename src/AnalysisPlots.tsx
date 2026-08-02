import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { ModeMapResult, ToleranceResult } from "./analysis";

const axis = { color: "#53636a", gridcolor: "rgba(23,48,58,0.08)", ticks: "outside" as const };
const plotConfig = { displaylogo: false, responsive: true, scrollZoom: false };

export function TolerancePlot({ result }: { result: ToleranceResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plotRef.current) return;
    const narrow = window.matchMedia("(max-width: 600px)").matches;
    void Plotly.react(plotRef.current, [
      { type: "histogram", name: "n<sub>eff</sub>", x: result.samples.map((sample) => sample.effectiveIndex), marker: { color: "#087f8c" }, opacity: 0.82 },
      { type: "scatter", mode: "markers", name: "Width response", x: result.samples.map((sample) => sample.widthUm), y: result.samples.map((sample) => sample.effectiveIndex), xaxis: "x2", yaxis: "y2", marker: { color: result.samples.map((sample) => sample.heightUm), colorscale: "Viridis", size: 7, colorbar: { title: { text: "Height (µm)" }, thickness: 11, ...(narrow ? { y: 0.19, len: 0.38 } : {}) } } },
    ] as Plotly.Data[], {
      margin: { l: 58, r: 70, t: 30, b: 54 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      showlegend: false,
      xaxis: { ...axis, domain: narrow ? [0, 1] : [0, 0.43], anchor: "y", title: { text: "Effective index" } },
      yaxis: { ...axis, domain: narrow ? [0.58, 1] : [0, 1], title: { text: "Samples" } },
      xaxis2: { ...axis, domain: narrow ? [0, 1] : [0.55, 1], anchor: "y2", title: { text: "Width (µm)" } },
      yaxis2: { ...axis, domain: narrow ? [0, 0.38] : [0, 1], anchor: "x2", title: { text: "Effective index" } },
    }, plotConfig);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);
  return <div ref={plotRef} className="analysis-plot" aria-label="Monte Carlo effective-index distribution and width sensitivity" />;
}

export function ModeMapPlot({ result }: { result: ModeMapResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plotRef.current) return;
    const narrow = window.matchMedia("(max-width: 600px)").matches;
    const parameterLabels = { widthUm: "Width", heightUm: "Height", slotGapUm: "Slot gap", couplerGapUm: "Coupler gap" };
    void Plotly.react(plotRef.current, [
      { type: "heatmap", name: "Mode count", x: result.valuesUm, y: result.wavelengthsUm, z: result.modeCount, zmin: 0, colorscale: "Viridis", colorbar: { title: { text: "Modes" }, thickness: 11, x: narrow ? 1.02 : 0.45, ...(narrow ? { y: 0.79, len: 0.38 } : {}) }, hovertemplate: "value = %{x:.3f} µm<br>λ = %{y:.3f} µm<br>guided modes = %{z}<extra></extra>" },
      { type: "heatmap", name: "Effective index", x: result.valuesUm, y: result.wavelengthsUm, z: result.effectiveIndex, xaxis: "x2", yaxis: "y2", colorscale: "Cividis", colorbar: { title: { text: "n<sub>eff</sub>" }, thickness: 11, ...(narrow ? { y: 0.19, len: 0.38 } : {}) }, hovertemplate: "value = %{x:.3f} µm<br>λ = %{y:.3f} µm<br>n<sub>eff</sub> = %{z:.5f}<extra></extra>" },
    ] as Plotly.Data[], {
      margin: { l: 62, r: 72, t: 30, b: 54 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      xaxis: { ...axis, domain: narrow ? [0, 1] : [0, 0.4], anchor: "y", title: { text: `${parameterLabels[result.parameter]} (µm)` } },
      yaxis: { ...axis, domain: narrow ? [0.58, 1] : [0, 1], title: { text: "Wavelength (µm)" } },
      xaxis2: { ...axis, domain: narrow ? [0, 1] : [0.58, 1], anchor: "y2", title: { text: `${parameterLabels[result.parameter]} (µm)` } },
      yaxis2: { ...axis, domain: narrow ? [0, 0.38] : [0, 1], anchor: "x2", title: { text: "Wavelength (µm)" } },
    }, plotConfig);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);
  return <div ref={plotRef} className="analysis-plot mode-map-plot" aria-label="Guided-mode count and effective-index maps" />;
}
