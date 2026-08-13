import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import { PLOT_AXIS, PLOT_CONFIG, PLOT_FONT, PLOT_LINE_WIDTHS, preparePlotlyToolbar } from "./plotConfig";
import type { BlochSweepResult } from "./solver";

export function BlochSweepPlot({ result }: { result: BlochSweepResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plotRef.current) return;
    const phase = result.points.map((point) => point.phaseRad / Math.PI);
    const candidatePhase = result.points.flatMap((point) => point.candidates.map(() => point.phaseRad / Math.PI));
    const candidates = result.points.flatMap((point) => point.candidates);
    const axis = PLOT_AXIS;
    void Plotly.react(plotRef.current, [
      {
        type: "scatter", mode: "markers", name: "Calculated modes", x: candidatePhase,
        y: candidates.map((mode) => mode.effectiveIndex), marker: { color: "rgba(83,99,106,0.35)", size: 6 },
        text: candidates.map((mode) => mode.modeLabel),
        hovertemplate: "%{text}<br>θ/π = %{x:.3f}<br>n<sub>eff</sub> = %{y:.6f}<extra></extra>",
      },
      {
        type: "scatter", mode: "lines+markers", name: "Tracked branch", x: phase,
        y: result.points.map((point) => point.effectiveIndex), line: { color: "#0072b2", width: PLOT_LINE_WIDTHS.emphasis },
        marker: { size: result.points.map((point) => point.degenerateSubspaceSize > 1 ? 9 : 5), color: "#0072b2" },
        text: result.points.map((point) => `${point.modeLabel}${point.degenerateSubspaceSize > 1 ? ` · ${point.degenerateSubspaceSize}D subspace` : ""}`),
        hovertemplate: "%{text}<br>θ/π = %{x:.3f}<br>n<sub>eff</sub> = %{y:.6f}<extra></extra>",
      },
      {
        type: "scatter", mode: "lines+markers", name: "Loss", x: phase, xaxis: "x2", yaxis: "y2",
        y: result.points.map((point) => point.lossDbPerCm), line: { color: "#cc79a7", width: PLOT_LINE_WIDTHS.primary, dash: "dot" }, marker: { size: 5 },
        hovertemplate: "θ/π = %{x:.3f}<br>loss = %{y:.4g} dB/cm<extra></extra>",
      },
    ] as Plotly.Data[], {
      margin: { l: 62, r: 24, t: 28, b: 54 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: PLOT_FONT,
      legend: { orientation: "h", x: 0, y: 1.1 },
      xaxis: { ...axis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...axis, domain: [0.4, 1], title: { text: "Effective index" } },
      xaxis2: { ...axis, domain: [0, 1], anchor: "y2", matches: "x", title: { text: `Bloch phase θ<sub>${result.axis}</sub>/π` } },
      yaxis2: { ...axis, domain: [0, 0.25], title: { text: "Loss (dB/cm)" } },
    }, PLOT_CONFIG).then(preparePlotlyToolbar);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);
  return <div ref={plotRef} className="sweep-plot scientific-plot-surface" role="img" aria-label={`Transverse Bloch dispersion along ${result.axis}`} />;
}
