import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { FieldComponent, WaveguideConfig, WaveguideMode } from "./solver";

interface Props {
  component: FieldComponent;
  config: WaveguideConfig;
  mode: WaveguideMode;
  xUm: number[];
  yUm: number[];
}

const labels: Record<FieldComponent, string> = {
  Ex: "E<sub>x</sub>",
  Ey: "E<sub>y</sub>",
  Ez: "E<sub>z</sub>",
  Hx: "H<sub>x</sub>",
  Hy: "H<sub>y</sub>",
  Hz: "H<sub>z</sub>",
  intensity: "|E|² (V²/m²)",
  poynting: "S<sub>z</sub> (W/m²)",
};

const plainLabels: Record<FieldComponent, string> = {
  Ex: "E x",
  Ey: "E y",
  Ez: "E z",
  Hx: "H x",
  Hy: "H y",
  Hz: "H z",
  intensity: "electric-field intensity",
  poynting: "longitudinal Poynting vector",
};

const units: Record<FieldComponent, string> = {
  Ex: "V/m", Ey: "V/m", Ez: "V/m",
  Hx: "A/m", Hy: "A/m", Hz: "A/m",
  intensity: "V²/m²", poynting: "W/m²",
};

export function ModePlot({ component, config, mode, xUm, yUm }: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fieldRef.current || !cutRef.current) return;
    const signedField = component !== "intensity";
    const z = mode.fields[component];
    const values = z.flat();
    const maximum = Math.max(...values.map((value) => Math.abs(value)), Number.EPSILON);
    const commonConfig = { displaylogo: false, responsive: true, scrollZoom: false };
    const axisStyle = {
      color: "#53636a",
      gridcolor: "rgba(23, 48, 58, 0.08)",
      zerolinecolor: "rgba(23, 48, 58, 0.16)",
      ticks: "outside" as const,
    };

    const heatmap = {
      type: "heatmap",
      x: xUm,
      y: yUm,
      z,
      zmin: signedField ? -maximum : 0,
      zmax: maximum,
      zmid: signedField ? 0 : undefined,
      colorscale: signedField ? "RdBu" : "Viridis",
      colorbar: {
        title: { text: labels[component], side: "right" },
        thickness: 12,
        len: 0.82,
      },
      hovertemplate: `x = %{x:.3f} µm<br>y = %{y:.3f} µm<br>value = %{z:.4g} ${units[component]}<extra></extra>`,
    } as unknown as Plotly.Data;
    void Plotly.react(fieldRef.current, [heatmap], {
      margin: { l: 58, r: 36, t: 18, b: 52 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      xaxis: { ...axisStyle, title: { text: "x (µm)" }, constrain: "domain" },
      yaxis: { ...axisStyle, title: { text: "y (µm)" }, scaleanchor: "x", scaleratio: 1 },
      shapes: geometryShapes(config),
    }, commonConfig);

    const centerRow = Math.floor(yUm.length / 2);
    const centerColumn = Math.floor(xUm.length / 2);
    void Plotly.react(cutRef.current, [
      {
        type: "scatter",
        mode: "lines",
        name: "Horizontal cut",
        x: xUm,
        y: z[centerRow],
        line: { color: "#087f8c", width: 2.5 },
        hovertemplate: `x = %{x:.3f} µm<br>value = %{y:.4g} ${units[component]}<extra>horizontal</extra>`,
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Vertical cut",
        x: yUm,
        y: z.map((row) => row[centerColumn]),
        line: { color: "#ed6a3a", width: 2.5, dash: "dash" },
        hovertemplate: `y = %{x:.3f} µm<br>value = %{y:.4g} ${units[component]}<extra>vertical</extra>`,
      },
    ], {
      margin: { l: 56, r: 20, t: 18, b: 50 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#19313a", size: 12 },
      legend: { orientation: "h", x: 0, y: 1.16 },
      xaxis: { ...axisStyle, title: { text: "Transverse position (µm)" } },
      yaxis: { ...axisStyle, title: { text: labels[component] }, range: signedField ? [-1.08 * maximum, 1.08 * maximum] : [0, 1.04 * maximum] },
    }, commonConfig);

    return () => {
      if (fieldRef.current) Plotly.purge(fieldRef.current);
      if (cutRef.current) Plotly.purge(cutRef.current);
    };
  }, [component, config, mode, xUm, yUm]);

  return (
    <div className="plots" role="group" aria-label={`${plainLabels[component]} profile and central transverse cuts for ${mode.polarization} mode ${mode.order + 1}`}>
      <div ref={fieldRef} className="field-plot" />
      <div ref={cutRef} className="cut-plot" />
    </div>
  );
}

function geometryShapes(config: WaveguideConfig): Partial<Plotly.Shape>[] {
  const line = { color: "rgba(255,255,255,0.9)", width: 1.5, dash: "dot" as const };
  const rectangle = (x0: number, x1: number, y0: number, y1: number) => ({ type: "rect" as const, x0, x1, y0, y1, line });
  const trapezoid = (centerX: number, topWidth: number, bottomWidth: number, bottomY: number, topY: number) => ({
    type: "path" as const,
    path: `M ${centerX - bottomWidth / 2},${bottomY} L ${centerX + bottomWidth / 2},${bottomY} L ${centerX + topWidth / 2},${topY} L ${centerX - topWidth / 2},${topY} Z`,
    line,
  });
  const geometry = config.geometry ?? "channel";
  const etchedHeight = geometry === "rib" ? config.heightUm - (config.slabHeightUm ?? config.heightUm / 2) : config.heightUm;
  const expansion = geometry === "slot" ? 0 : etchedHeight / Math.tan((config.sidewallAngleDeg ?? 90) * Math.PI / 180);
  if (geometry === "slot") {
    const gap = config.slotGapUm ?? config.widthUm / 5;
    return [
      rectangle(-config.widthUm / 2, -gap / 2, -config.heightUm / 2, config.heightUm / 2),
      rectangle(gap / 2, config.widthUm / 2, -config.heightUm / 2, config.heightUm / 2),
    ];
  }
  if (geometry === "coupler") {
    const gap = config.couplerGapUm ?? config.widthUm / 2;
    const bottomWidth = config.widthUm + 2 * expansion;
    return [
      trapezoid(-gap / 2 - config.widthUm / 2, config.widthUm, bottomWidth, -config.heightUm / 2, config.heightUm / 2),
      trapezoid(gap / 2 + config.widthUm / 2, config.widthUm, bottomWidth, -config.heightUm / 2, config.heightUm / 2),
    ];
  }
  if (geometry === "rib") {
    const slabTop = -config.heightUm / 2 + (config.slabHeightUm ?? config.heightUm / 2);
    return [
      rectangle(-config.paddingUm - config.widthUm / 2 - expansion, config.paddingUm + config.widthUm / 2 + expansion, -config.heightUm / 2, slabTop),
      trapezoid(0, config.widthUm, config.widthUm + 2 * expansion, slabTop, config.heightUm / 2),
    ];
  }
  const bottomWidth = config.widthUm + 2 * expansion;
  const shapes: Partial<Plotly.Shape>[] = [trapezoid(0, config.widthUm, bottomWidth, -config.heightUm / 2, config.heightUm / 2)];
  if (geometry === "multilayer") shapes.push({ type: "line", x0: -config.paddingUm - bottomWidth / 2, x1: config.paddingUm + bottomWidth / 2, y0: -config.heightUm / 2, y1: -config.heightUm / 2, line });
  return shapes;
}
