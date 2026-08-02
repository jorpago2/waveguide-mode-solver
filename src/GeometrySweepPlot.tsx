import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { GeometrySweepResult } from "./solver";

const parameterLabels = { widthUm: "Core width", heightUm: "Core height", slotGapUm: "Slot gap" };

export function GeometrySweepPlot({ result }: { result: GeometrySweepResult }) {
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plotRef.current) return;
    const x = result.points.map((point) => point.valueUm);
    const axis = { color: "#53636a", gridcolor: "rgba(23,48,58,0.08)", ticks: "outside" as const };
    void Plotly.react(plotRef.current, [
      { type: "scatter", mode: "lines+markers", name: "n<sub>eff</sub>", x, y: result.points.map((point) => point.effectiveIndex), line: { color: "#087f8c", width: 2.5 }, marker: { size: 5 } },
      { type: "scatter", mode: "lines+markers", name: "Confinement", x, y: result.points.map((point) => 100 * point.electricConfinement), yaxis: "y2", line: { color: "#ed6a3a", width: 2.5, dash: "dash" }, marker: { size: 5 } },
      { type: "scatter", mode: "lines", name: "A<sub>eff</sub>", x, y: result.points.map((point) => point.effectiveAreaUm2), xaxis: "x2", yaxis: "y3", line: { color: "#7156a5", width: 2 } },
      { type: "scatter", mode: "lines", name: "Overlap", x, y: result.points.map((point) => point.overlap), xaxis: "x2", yaxis: "y4", line: { color: "#b6472d", width: 2, dash: "dot" } },
    ] as Plotly.Data[], {
      margin: { l: 58, r: 68, t: 28, b: 54 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      legend: { orientation: "h", x: 0, y: 1.1 },
      xaxis: { ...axis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...axis, domain: [0.56, 1], title: { text: "Effective index" } },
      yaxis2: { ...axis, domain: [0.56, 1], title: { text: "Confinement (%)" }, overlaying: "y", side: "right", showgrid: false },
      xaxis2: { ...axis, domain: [0, 1], anchor: "y3", matches: "x", title: { text: `${parameterLabels[result.parameter]} (µm)` } },
      yaxis3: { ...axis, domain: [0, 0.38], title: { text: "A<sub>eff</sub> (µm²)" } },
      yaxis4: { ...axis, domain: [0, 0.38], title: { text: "Overlap" }, range: [0, 1.05], overlaying: "y3", side: "right", showgrid: false },
    }, { displaylogo: false, responsive: true, scrollZoom: false });
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);
  return <div ref={plotRef} className="sweep-plot" aria-label={`${parameterLabels[result.parameter]} modal sweep`} />;
}
