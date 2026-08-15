import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import { CarbonCheckboxField, CarbonSelectField, CarbonSwitcher } from "./CarbonControls";
import { MATPLOTLIB_RDBU_R } from "./plotColors";
import { PLOT_AXIS, PLOT_CONFIG, PLOT_FONT, PLOT_LINE_WIDTHS, preparePlotlyToolbar } from "./plotConfig";
import type { SolverResult, WaveguideConfig, WaveguideMode } from "./solver";

type PrincipalAxis = "x" | "y" | "z";
type MaterialQuantity = "n-real" | "n-imaginary" | "n-magnitude" | "epsilon-real" | "epsilon-imaginary" | "epsilon-magnitude";

const quantities: Array<{ id: MaterialQuantity; label: string }> = [
  { id: "n-real", label: "Re(n)" },
  { id: "n-imaginary", label: "Im(n)" },
  { id: "n-magnitude", label: "|n|" },
  { id: "epsilon-real", label: "Re(ε)" },
  { id: "epsilon-imaginary", label: "Im(ε)" },
  { id: "epsilon-magnitude", label: "|ε|" },
];

export function GeometryPlot({ config, result, mode }: { config: WaveguideConfig; result: SolverResult; mode?: WaveguideMode }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState<PrincipalAxis>("x");
  const [quantity, setQuantity] = useState<MaterialQuantity>("n-real");
  const [showMesh, setShowMesh] = useState(true);
  const [showMode, setShowMode] = useState(true);

  useEffect(() => {
    if (!plotRef.current) return;
    const [xMinimum, xMaximum] = [result.xEdgesUm[0], result.xEdgesUm.at(-1) as number];
    const [yMinimum, yMaximum] = [result.yEdgesUm[0], result.yEdgesUm.at(-1) as number];
    const meshShapes = showMesh ? [
      ...result.xEdgesUm.map((x) => ({ type: "line" as const, x0: x, x1: x, y0: yMinimum, y1: yMaximum, line: { color: PLOT_AXIS.gridcolor as string, width: 0.5 } })),
      ...result.yEdgesUm.map((y) => ({ type: "line" as const, x0: xMinimum, x1: xMaximum, y0: y, y1: y, line: { color: PLOT_AXIS.gridcolor as string, width: 0.5 } })),
    ] : [];
    const pmlThickness = (config.boundary ?? "hard") === "pml" ? (config.pmlThicknessUm ?? config.paddingUm * 0.6) : 0;
    const pmlShapes = pmlThickness > 0 ? [
      ...(!config.periodicX ? [
        { type: "line" as const, x0: xMinimum + pmlThickness, x1: xMinimum + pmlThickness, y0: yMinimum, y1: yMaximum },
        { type: "line" as const, x0: xMaximum - pmlThickness, x1: xMaximum - pmlThickness, y0: yMinimum, y1: yMaximum },
      ] : []),
      ...(!config.periodicY ? [
        { type: "line" as const, x0: xMinimum, x1: xMaximum, y0: yMinimum + pmlThickness, y1: yMinimum + pmlThickness },
        { type: "line" as const, x0: xMinimum, x1: xMaximum, y0: yMaximum - pmlThickness, y1: yMaximum - pmlThickness },
      ] : []),
    ].map((shape) => ({ ...shape, line: { color: "#d55e00", width: PLOT_LINE_WIDTHS.reference, dash: "dash" as const } })) : [];
    const periodicShapes = [
      ...(config.periodicX ? [
        { type: "line" as const, x0: xMinimum, x1: xMinimum, y0: yMinimum, y1: yMaximum },
        { type: "line" as const, x0: xMaximum, x1: xMaximum, y0: yMinimum, y1: yMaximum },
      ] : []),
      ...(config.periodicY ? [
        { type: "line" as const, x0: xMinimum, x1: xMaximum, y0: yMinimum, y1: yMinimum },
        { type: "line" as const, x0: xMinimum, x1: xMaximum, y0: yMaximum, y1: yMaximum },
      ] : []),
    ].map((shape) => ({ ...shape, line: { color: "#0072b2", width: PLOT_LINE_WIDTHS.secondary, dash: "dot" as const } }));

    const epsilonReal = result.permittivity.real[axis];
    const epsilonImaginary = result.permittivity.imaginary[axis];
    const epsilonMagnitude = epsilonReal.map((row, rowIndex) => row.map((value, columnIndex) => Math.hypot(value, epsilonImaginary[rowIndex][columnIndex])));
    const map = quantity === "n-real" ? epsilonMagnitude.map((row, rowIndex) => row.map((magnitude, columnIndex) => Math.sqrt(Math.max(0, (magnitude + epsilonReal[rowIndex][columnIndex]) / 2))))
      : quantity === "n-imaginary" ? epsilonMagnitude.map((row, rowIndex) => row.map((magnitude, columnIndex) => Math.sqrt(Math.max(0, (magnitude - epsilonReal[rowIndex][columnIndex]) / 2))))
        : quantity === "n-magnitude" ? epsilonMagnitude.map((row) => row.map(Math.sqrt))
          : quantity === "epsilon-real" ? epsilonReal
            : quantity === "epsilon-imaginary" ? epsilonImaginary : epsilonMagnitude;
    const epsilonComponent = `ε<sub>${axis}${axis}</sub>`;
    const indexComponent = `n<sub>${axis}</sub>`;
    const label = quantity === "n-real" ? `Re(${indexComponent})`
      : quantity === "n-imaginary" ? `Im(${indexComponent})`
        : quantity === "n-magnitude" ? `|${indexComponent}|`
          : quantity === "epsilon-real" ? `Re(${epsilonComponent})`
            : quantity === "epsilon-imaginary" ? `Im(${epsilonComponent})` : `|${epsilonComponent}|`;

    const data: Plotly.Data[] = [{
      type: "heatmap",
      x: result.xEdgesUm,
      y: result.yEdgesUm,
      z: map,
      zsmooth: false,
      colorscale: quantity === "epsilon-real" ? MATPLOTLIB_RDBU_R : "Cividis",
      ...(quantity === "epsilon-real" ? { zmid: 0 } : {}),
      colorbar: { title: { text: label, side: "right" }, thickness: 13, len: 0.84 },
      hovertemplate: `x = %{x:.4f} µm<br>y = %{y:.4f} µm<br>${label} = %{z:.6f}<extra></extra>`,
    } as Plotly.Data];
    if (showMode && mode) {
      const maximumIntensity = Math.max(...mode.fields.intensity.flat(), Number.EPSILON);
      data.push({
        type: "contour", x: result.xUm, y: result.yUm,
        z: mode.fields.intensity.map((row) => row.map((value) => value / maximumIntensity)),
        name: `${mode.label} |E|²`, showlegend: false, showscale: false, hoverinfo: "skip",
        contours: { start: 0.1, end: 0.9, size: 0.2, coloring: "none", showlabels: false },
        line: { color: "#cc79a7", width: PLOT_LINE_WIDTHS.primary },
      } as Plotly.Data);
    }

    void Plotly.react(plotRef.current, data, {
      margin: { l: 58, r: 42, t: 18, b: 52 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: PLOT_FONT,
      xaxis: { title: { text: "x (µm)" }, color: PLOT_AXIS.color, ticks: "outside", constrain: "domain" },
      yaxis: { title: { text: "y (µm)" }, color: PLOT_AXIS.color, ticks: "outside", scaleanchor: "x", scaleratio: 1 },
      shapes: [...meshShapes, ...pmlShapes, ...periodicShapes],
    }, PLOT_CONFIG).then(preparePlotlyToolbar);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [axis, config, mode, quantity, result, showMesh, showMode]);

  return <>
    <div className="field-toolbar geometry-toolbar" aria-label="Material quantity and tensor component">
      <CarbonSelectField id="material-quantity" label="Material quantity" value={quantity} inline options={quantities.map((option) => ({ value: option.id, label: option.label }))} onChange={(value) => setQuantity(value as MaterialQuantity)} />
      <CarbonSwitcher label="Tensor component" value={axis} options={(["x", "y", "z"] as const).map((component) => ({ value: component, label: `${component}${component}` }))} onChange={(value) => setAxis(value as PrincipalAxis)} />
      <CarbonCheckboxField label="Show mesh" checked={showMesh} onChange={setShowMesh} />
      <CarbonCheckboxField label="Mode |E|²" checked={showMode} disabled={!mode} onChange={setShowMode} />
      <small>{result.nx} × {result.ny} cells</small>
    </div>
    <div ref={plotRef} className="geometry-plot scientific-plot-surface" role="img" aria-label={`Waveguide geometry, ${quantity} ${axis}${axis} material map and computational mesh`} />
    <p className="plot-note">Cell-centred material values after subpixel averaging. The complex index uses the passive branch of n² = ε, with Im(n) = κ ≥ 0. Contours show normalized modal |E|²; dashed orange lines mark PML onset and dotted blue boundary pairs are Bloch-periodic.</p>
  </>;
}
