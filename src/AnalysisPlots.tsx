import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { ConvergenceResult, ModeMapResult, ToleranceResult } from "./analysis";
import type { TopologySweepResult } from "./solver";

const axis = { color: "#53636a", gridcolor: "rgba(23,48,58,0.08)", ticks: "outside" as const };
const plotConfig = { displaylogo: false, responsive: true, scrollZoom: false };

export function ConvergencePlot({ result }: { result: ConvergenceResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plotRef.current) return;
    const resolutions = result.levels.map((level) => level.resolution);
    const data: Plotly.Data[] = [
      { type: "scatter", mode: "lines+markers", name: "n<sub>eff</sub>", x: resolutions, y: result.levels.map((level) => level.effectiveIndex), line: { color: "#087f8c", width: 2.5 }, marker: { size: 8 } },
      { type: "scatter", mode: "lines+markers", name: "Loss", x: resolutions, y: result.levels.map((level) => level.lossDbPerCm), yaxis: "y2", line: { color: "#ed6a3a", width: 2, dash: "dash" }, marker: { size: 7 } },
    ];
    if (result.richardsonEffectiveIndex !== undefined) data.push({
      type: "scatter", mode: "lines", name: "Richardson n<sub>eff</sub>", x: [resolutions[0], resolutions[2]],
      y: [result.richardsonEffectiveIndex, result.richardsonEffectiveIndex], line: { color: "#7156a5", width: 1.5, dash: "dot" },
    });
    void Plotly.react(plotRef.current, data, {
      margin: { l: 68, r: 76, t: 38, b: 58 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      legend: { orientation: "h", x: 0, y: 1.12 },
      xaxis: { ...axis, title: { text: "Nominal grid resolution (cells)" } },
      yaxis: { ...axis, title: { text: "Effective index" }, tickformat: ".7f" },
      yaxis2: { ...axis, overlaying: "y", side: "right", title: { text: "Loss (dB/cm)" }, type: result.levels.every((level) => level.lossDbPerCm > 0) ? "log" : "linear", showgrid: false },
    }, plotConfig);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);
  return <div ref={plotRef} className="analysis-plot convergence-plot" aria-label="Effective-index and loss convergence with grid refinement" />;
}

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
    const parameterLabels = { widthUm: "Width", heightUm: "Height", slotGapUm: "Slot gap", couplerGapUm: "Coupler gap", bendRadiusUm: "Bend radius" };
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

export function ModeTopologyPlot({ result }: { result: TopologySweepResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plotRef.current) return;
    const narrow = window.matchMedia("(max-width: 600px)").matches;
    const branches = [...new Set(result.points.flatMap((point) => point.modes.map((mode) => mode.branch)))];
    const maximumLogK = Math.max(1e-9, ...result.points.flatMap((point) => point.modes
      .map((mode) => Math.log10(Math.max(1, mode.petermannFactorEstimate)))));
    const colors = ["#087f8c", "#ed6a3a", "#7156a5", "#b69b22", "#2f6f4e", "#a54268", "#5c7280", "#9a5c2e"];
    const data: Plotly.Data[] = [];
    branches.forEach((branch, branchIndex) => {
      const samples = result.points.flatMap((point) => {
        const mode = point.modes.find((candidate) => candidate.branch === branch);
        return mode ? [{ value: point.value, ...mode }] : [];
      });
      const color = colors[branchIndex % colors.length];
      data.push({
        type: "scatter", mode: "lines+markers", name: `Branch ${branch + 1}`, x: samples.map((sample) => sample.value),
        y: samples.map((sample) => sample.effectiveIndex), line: { color, width: 2 }, marker: { color, size: 5 },
        text: samples.map((sample) => `${sample.label}<br>Im(neff) = ${sample.effectiveIndexImaginary.toExponential(3)}<br>κproj = ${sample.conditionEstimate.toPrecision(4)}`),
        hovertemplate: "%{text}<br>parameter = %{x:.5g}<br>Re(n<sub>eff</sub>) = %{y:.7f}<extra></extra>",
      });
      data.push({
        type: "scatter", mode: "lines+markers", name: `Branch ${branch + 1}`, showlegend: false, xaxis: "x2", yaxis: "y2",
        x: samples.map((sample) => sample.effectiveIndex), y: samples.map((sample) => sample.effectiveIndexImaginary),
        line: { color, width: 1.5 }, marker: { color: samples.map((sample) => Math.log10(Math.max(1, sample.petermannFactorEstimate))), colorscale: "Magma", cmin: 0, cmax: maximumLogK, size: 7,
          ...(branchIndex === 0 ? { colorbar: { title: { text: "log₁₀ Kproj" }, thickness: 11 } } : {}) },
        text: samples.map((sample) => `${sample.label}<br>parameter = ${sample.value.toPrecision(5)}<br>Kproj = ${sample.petermannFactorEstimate.toPrecision(4)}`),
        hovertemplate: "%{text}<br>Re(n<sub>eff</sub>) = %{x:.7f}<br>Im(n<sub>eff</sub>) = %{y:.3e}<extra></extra>",
      });
    });
    data.push({
      type: "scatter", mode: "markers", name: "Interaction candidate",
      x: result.interactions.map((interaction) => interaction.value),
      y: result.interactions.map((interaction) => {
        const point = result.points.find((candidate) => candidate.value === interaction.value) as TopologySweepResult["points"][number];
        return point.modes.filter((mode) => interaction.branches.includes(mode.branch)).reduce((sum, mode) => sum + mode.effectiveIndex / 2, 0);
      }),
      marker: { color: "#b42525", size: 11, symbol: "diamond-open", line: { width: 2 } },
      text: result.interactions.map((interaction) => `${interaction.classification}<br>Δn = ${interaction.complexIndexGap.toExponential(3)}<br>overlap = ${interaction.rightModeOverlap.toFixed(3)}`),
      hovertemplate: "%{text}<extra></extra>",
    });
    const label = result.parameter === "wavelengthUm" ? "Wavelength (µm)" : result.parameter === "coreExtinction" ? "Core extinction κ" : `${result.parameter.replace("Um", "")} (µm)`;
    void Plotly.react(plotRef.current, data, {
      margin: { l: 68, r: 72, t: 42, b: 58 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      legend: { orientation: "h", x: 0, y: 1.12 },
      xaxis: { ...axis, domain: narrow ? [0, 1] : [0, 0.44], anchor: "y", title: { text: label } },
      yaxis: { ...axis, domain: narrow ? [0.58, 1] : [0, 1], title: { text: "Re(neff)" }, tickformat: ".7f" },
      xaxis2: { ...axis, domain: narrow ? [0, 1] : [0.58, 1], anchor: "y2", title: { text: "Re(neff)" } },
      yaxis2: { ...axis, domain: narrow ? [0, 0.38] : [0, 1], anchor: "x2", title: { text: "Im(neff)" }, exponentformat: "power" },
    }, plotConfig);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);
  return <div ref={plotRef} className="analysis-plot mode-map-plot" aria-label="Tracked modal branches and complex effective-index trajectories" />;
}
