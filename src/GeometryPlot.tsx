import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { SolverResult, WaveguideConfig, WaveguideMode } from "./solver";

type PrincipalAxis = "x" | "y" | "z";

export function GeometryPlot({ config, result, mode }: { config: WaveguideConfig; result: SolverResult; mode?: WaveguideMode }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState<PrincipalAxis>("x");
  const [showMesh, setShowMesh] = useState(true);
  const [showMode, setShowMode] = useState(true);

  useEffect(() => {
    if (!plotRef.current) return;
    const [xMinimum, xMaximum] = [result.xEdgesUm[0], result.xEdgesUm.at(-1) as number];
    const [yMinimum, yMaximum] = [result.yEdgesUm[0], result.yEdgesUm.at(-1) as number];
    const meshShapes = showMesh ? [
      ...result.xEdgesUm.map((x) => ({ type: "line" as const, x0: x, x1: x, y0: yMinimum, y1: yMaximum, line: { color: "rgba(18,43,52,0.18)", width: 0.5 } })),
      ...result.yEdgesUm.map((y) => ({ type: "line" as const, x0: xMinimum, x1: xMaximum, y0: y, y1: y, line: { color: "rgba(18,43,52,0.18)", width: 0.5 } })),
    ] : [];
    const pmlThickness = (config.boundary ?? "hard") === "pml" ? (config.pmlThicknessUm ?? config.paddingUm * 0.6) : 0;
    const pmlShapes = pmlThickness > 0 ? [
      { type: "line" as const, x0: xMinimum + pmlThickness, x1: xMinimum + pmlThickness, y0: yMinimum, y1: yMaximum },
      { type: "line" as const, x0: xMaximum - pmlThickness, x1: xMaximum - pmlThickness, y0: yMinimum, y1: yMaximum },
      { type: "line" as const, x0: xMinimum, x1: xMaximum, y0: yMinimum + pmlThickness, y1: yMinimum + pmlThickness },
      { type: "line" as const, x0: xMinimum, x1: xMaximum, y0: yMaximum - pmlThickness, y1: yMaximum - pmlThickness },
    ].map((shape) => ({ ...shape, line: { color: "#d55e00", width: 1.5, dash: "dash" as const } })) : [];

    const data: Plotly.Data[] = [{
      type: "heatmap",
      x: result.xEdgesUm,
      y: result.yEdgesUm,
      z: result.refractiveIndex[axis],
      zsmooth: false,
      colorscale: "Cividis",
      colorbar: { title: { text: `n<sub>${axis}</sub>`, side: "right" }, thickness: 13, len: 0.84 },
      hovertemplate: `x = %{x:.4f} µm<br>y = %{y:.4f} µm<br>n<sub>${axis}</sub> = %{z:.6f}<extra></extra>`,
    } as Plotly.Data];
    if (showMode && mode) {
      const maximumIntensity = Math.max(...mode.fields.intensity.flat(), Number.EPSILON);
      data.push({
        type: "contour", x: result.xUm, y: result.yUm,
        z: mode.fields.intensity.map((row) => row.map((value) => value / maximumIntensity)),
        name: `${mode.label} |E|²`, showlegend: false, showscale: false, hoverinfo: "skip",
        contours: { start: 0.1, end: 0.9, size: 0.2, coloring: "none", showlabels: false },
        line: { color: "#cc79a7", width: 1.8 },
      } as Plotly.Data);
    }

    void Plotly.react(plotRef.current, data, {
      margin: { l: 58, r: 42, t: 18, b: 52 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      xaxis: { title: { text: "x (µm)" }, color: "#53636a", ticks: "outside", constrain: "domain" },
      yaxis: { title: { text: "y (µm)" }, color: "#53636a", ticks: "outside", scaleanchor: "x", scaleratio: 1 },
      shapes: [...meshShapes, ...pmlShapes],
    }, { displaylogo: false, responsive: true, scrollZoom: false });
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [axis, config, mode, result, showMesh, showMode]);

  return <>
    <div className="field-toolbar geometry-toolbar" aria-label="Refractive-index component">
      <span>Principal index</span>
      {(["x", "y", "z"] as const).map((component) => <button type="button" className={axis === component ? "active" : ""} aria-pressed={axis === component} key={component} onClick={() => setAxis(component)}>n<sub>{component}</sub></button>)}
      <label className="checkbox-field"><input type="checkbox" checked={showMesh} onChange={(event) => setShowMesh(event.target.checked)} />Show mesh</label>
      <label className="checkbox-field"><input type="checkbox" checked={showMode} disabled={!mode} onChange={(event) => setShowMode(event.target.checked)} />Mode |E|²</label>
      <small>{result.nx} × {result.ny} cells</small>
    </div>
    <div ref={plotRef} className="geometry-plot" aria-label={`Waveguide geometry, ${axis}-axis refractive index and computational mesh`} />
    <p className="plot-note">Cell-centred principal index after subpixel material averaging. Contours show normalized modal |E|²; mesh lines are the actual finite-difference cell boundaries and dashed orange lines mark the PML onset.</p>
  </>;
}
