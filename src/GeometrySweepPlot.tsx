import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import { useScientificPlotTheme } from "@jorpago2/scientific-ui";
import { createPlotAxis, createPlotFont, PLOT_CONFIG, PLOT_LINE_WIDTHS, preparePlotlyToolbar } from "./plotConfig";
import type { GeometrySweepResult } from "./solver";

const parameterLabels = { widthUm: "Core width", heightUm: "Core height", slotGapUm: "Slot gap", couplerGapUm: "Coupler gap", bendRadiusUm: "Bend radius" };

export function GeometrySweepPlot({ result }: { result: GeometrySweepResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const theme = useScientificPlotTheme();
  useEffect(() => {
    if (!plotRef.current) return;
    const x = result.points.map((point) => point.valueUm);
    const bendSweep = result.parameter === "bendRadiusUm";
    const axis = createPlotAxis(theme);
    const font = createPlotFont(theme);
    void Plotly.react(plotRef.current, [
      { type: "scatter", mode: "lines+markers", name: "n<sub>eff</sub>", x, y: result.points.map((point) => point.effectiveIndex), line: { color: "#0072b2", width: PLOT_LINE_WIDTHS.emphasis }, marker: { size: result.points.map((point) => point.nearCutoff ? 9 : 5), color: result.points.map((point) => point.nearCutoff ? "#d55e00" : "#0072b2") }, text: result.points.map((point) => `${point.modeLabel}${point.nearCutoff ? " · near cutoff" : ""}`), hovertemplate: "%{text}<br>n<sub>eff</sub> = %{y:.6f}<extra></extra>" },
      { type: "scatter", mode: "lines+markers", name: "Confinement", x, y: result.points.map((point) => 100 * point.electricConfinement), yaxis: "y2", line: { color: "#d55e00", width: PLOT_LINE_WIDTHS.emphasis, dash: "dash" }, marker: { size: 5 } },
      { type: "scatter", mode: "lines", name: bendSweep ? "Loss" : "A<sub>eff</sub>", x, y: result.points.map((point) => bendSweep ? point.lossDbPerCm : point.effectiveAreaUm2), xaxis: "x2", yaxis: "y3", line: { color: "#009e73", width: PLOT_LINE_WIDTHS.primary } },
      { type: "scatter", mode: "lines", name: "Subspace overlap", x, y: result.points.map((point) => point.overlap), xaxis: "x2", yaxis: "y4", line: { color: "#cc79a7", width: PLOT_LINE_WIDTHS.primary, dash: "dot" } },
    ] as Plotly.Data[], {
      margin: { l: 58, r: 68, t: 28, b: 54 }, paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff",
      font,
      legend: { orientation: "h", x: 0, y: 1.1 },
      xaxis: { ...axis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...axis, domain: [0.56, 1], title: { text: "Effective index" } },
      yaxis2: { ...axis, domain: [0.56, 1], title: { text: "Confinement (%)" }, overlaying: "y", side: "right", showgrid: false },
      xaxis2: { ...axis, domain: [0, 1], anchor: "y3", matches: "x", title: { text: `${parameterLabels[result.parameter]} (µm)` } },
      yaxis3: { ...axis, domain: [0, 0.38], title: { text: bendSweep ? "Loss (dB/cm)" : "A<sub>eff</sub> (µm²)" }, type: bendSweep ? "log" : "linear" },
      yaxis4: { ...axis, domain: [0, 0.38], title: { text: "Subspace overlap" }, range: [0, 1.05], overlaying: "y3", side: "right", showgrid: false },
    }, PLOT_CONFIG).then(preparePlotlyToolbar);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result, theme]);
  return <div ref={plotRef} className="sweep-plot scientific-plot-surface" role="img" aria-label={`${parameterLabels[result.parameter]} modal sweep`} />;
}
