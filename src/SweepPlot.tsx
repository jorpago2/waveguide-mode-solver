import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import { PLOT_CONFIG } from "./plotConfig";
import type { SweepResult } from "./solver";

export function SweepPlot({ result }: { result: SweepResult }) {
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plotRef.current) return;
    const wavelength = result.points.map((point) => point.wavelengthUm);
    const axis = { color: "#53636a", gridcolor: "rgba(23,48,58,0.08)", ticks: "outside" as const };
    void Plotly.react(plotRef.current, [
      {
        type: "scatter", mode: "lines+markers", name: "n<sub>eff</sub>", x: wavelength,
        y: result.points.map((point) => point.effectiveIndex), line: { color: "#087f8c", width: 2.5 },
        marker: { size: result.points.map((point) => point.nearCutoff ? 9 : 5), color: result.points.map((point) => point.nearCutoff ? "#ed6a3a" : "#087f8c") },
        text: result.points.map((point) => `${point.modeLabel}${point.nearCutoff ? " · near cutoff" : ""}`), hovertemplate: "%{text}<br>λ = %{x:.4f} µm<br>n<sub>eff</sub> = %{y:.6f}<extra></extra>",
      },
      {
        type: "scatter", mode: "lines+markers", name: "n<sub>g</sub>", x: wavelength,
        y: result.points.map((point) => point.groupIndex), line: { color: "#ed6a3a", width: 2.5, dash: "dash" },
        marker: { size: 5 }, hovertemplate: "λ = %{x:.4f} µm<br>n<sub>g</sub> = %{y:.6f}<extra></extra>",
      },
      {
        type: "scatter", mode: "lines", name: "D", x: wavelength,
        y: result.points.map((point) => point.dispersionPsPerNmKm), xaxis: "x2", yaxis: "y2",
        line: { color: "#7156a5", width: 2 },
        hovertemplate: "λ = %{x:.4f} µm<br>D = %{y:.2f} ps/(nm·km)<extra></extra>",
      },
      {
        type: "scatter", mode: "lines", name: "β<sub>2</sub>", x: wavelength,
        y: result.points.map((point) => point.beta2Ps2PerKm), xaxis: "x2", yaxis: "y3",
        line: { color: "#ed6a3a", width: 2, dash: "dash" },
        hovertemplate: "λ = %{x:.4f} µm<br>β<sub>2</sub> = %{y:.2f} ps²/km<extra></extra>",
      },
      {
        type: "scatter", mode: "lines", name: "Loss", x: wavelength,
        y: result.points.map((point) => point.lossDbPerCm), xaxis: "x3", yaxis: "y4",
        line: { color: "#b6472d", width: 2, dash: "dot" },
        hovertemplate: "λ = %{x:.4f} µm<br>loss = %{y:.3g} dB/cm<extra></extra>",
      },
    ] as Plotly.Data[], {
      margin: { l: 58, r: 68, t: 28, b: 54 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      legend: { orientation: "h", x: 0, y: 1.1 },
      xaxis: { ...axis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...axis, domain: [0.69, 1], title: { text: "Modal index" } },
      xaxis2: { ...axis, domain: [0, 1], anchor: "y2", matches: "x", showticklabels: false },
      yaxis2: { ...axis, domain: [0.35, 0.58], title: { text: "D (ps/(nm·km))" } },
      yaxis3: { ...axis, domain: [0.35, 0.58], title: { text: "β₂ (ps²/km)" }, overlaying: "y2", side: "right", showgrid: false },
      xaxis3: { ...axis, domain: [0, 1], anchor: "y4", matches: "x", title: { text: "Wavelength (µm)" } },
      yaxis4: { ...axis, domain: [0, 0.2], title: { text: "Loss (dB/cm)" } },
    }, PLOT_CONFIG);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result]);

  return <div ref={plotRef} className="sweep-plot" aria-label="Effective index, group index, D, beta two and loss wavelength sweep" />;
}
