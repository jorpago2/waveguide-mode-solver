import { useEffect, useId, useMemo, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import { useScientificPlotTheme } from "@jorpago2/scientific-ui";
import { MATPLOTLIB_RDBU_R } from "./plotColors";
import { createPlotAxis, createPlotFont, PLOT_CONFIG, PLOT_LINE_WIDTHS, preparePlotlyToolbar } from "./plotConfig";
import { interpolateFieldMatrix, type ComplexFieldMatrix, type FieldComponent, type PhysicalFieldComponent, type WaveguideConfig, type WaveguideMode } from "./solver";

export type FieldPart = "real" | "imaginary" | "magnitude" | "phase";
export type DisplayInterpolation = 1 | 2 | 4;

interface Props {
  component: FieldComponent;
  part: FieldPart;
  config: WaveguideConfig;
  mode: WaveguideMode;
  xUm: number[];
  yUm: number[];
  displayInterpolation: DisplayInterpolation;
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

export function ModePlot({ component, part, config, mode, xUm, yUm, displayInterpolation }: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<HTMLDivElement>(null);
  const theme = useScientificPlotTheme();
  const display = useMemo(() => buildDisplayField(mode, component, isPhysicalField(component) ? part : "real", xUm, yUm, displayInterpolation), [component, displayInterpolation, mode, part, xUm, yUm]);
  const descriptionId = `mode-map-description-${useId().replace(/:/g, "")}`;
  const summary = modeMapSummary(component, part, mode, display.x, display.y, display.values);

  useEffect(() => {
    if (!fieldRef.current || !cutRef.current) return;
    const plotAxis = createPlotAxis(theme);
    const font = createPlotFont(theme);
    const physical = isPhysicalField(component);
    const activePart = physical ? part : "real";
    const plotXUm = display.x;
    const plotYUm = display.y;
    const z = display.values;
    const signedField = activePart !== "magnitude" && activePart !== "phase" && component !== "intensity";
    const phaseField = activePart === "phase";
    const bent = (config.bendRadiusUm ?? 0) > 0;
    const baseLabel = bent && component === "Ez" ? "E<sub>θ</sub>" : bent && component === "Hz" ? "H<sub>θ</sub>" : bent && component === "poynting" ? "S<sub>θ</sub> (W/m²)" : labels[component];
    const componentLabel = physical ? `${partLabel(activePart)}(${baseLabel})` : baseLabel;
    let maximum = Number.EPSILON;
    for (const row of z) for (const value of row) maximum = Math.max(maximum, Math.abs(value));
    const axisStyle = {
      color: plotAxis.color,
      gridcolor: plotAxis.gridcolor,
      zerolinecolor: "#b7c6ca",
      ticks: "outside" as const,
    };

    const heatmap = {
      type: "heatmap",
      x: plotXUm,
      y: plotYUm,
      z,
      zmin: phaseField ? -180 : signedField ? -maximum : 0,
      zmax: phaseField ? 180 : maximum,
      zmid: signedField ? 0 : undefined,
      colorscale: phaseField ? "HSV" : signedField ? MATPLOTLIB_RDBU_R : "Viridis",
      colorbar: {
        title: { text: componentLabel, side: "right" },
        thickness: 12,
        len: 0.82,
      },
      hovertemplate: `x = %{x:.3f} µm<br>y = %{y:.3f} µm<br>value = %{z:.4g} ${phaseField ? "°" : units[component]}<extra></extra>`,
    } as unknown as Plotly.Data;
    void Plotly.react(fieldRef.current, [heatmap], {
      margin: { l: 58, r: 36, t: 18, b: 52 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font,
      xaxis: { ...axisStyle, title: { text: "x (µm)" }, constrain: "domain" },
      yaxis: { ...axisStyle, title: { text: "y (µm)" }, scaleanchor: "x", scaleratio: 1 },
      shapes: geometryShapes(config),
    }, PLOT_CONFIG).then(preparePlotlyToolbar);

    const centerRow = Math.floor(plotYUm.length / 2);
    const centerColumn = Math.floor(plotXUm.length / 2);
    void Plotly.react(cutRef.current, [
      {
        type: "scatter",
        mode: "lines",
        name: "Horizontal cut",
        x: plotXUm,
        y: z[centerRow],
        line: { color: "#0072b2", width: PLOT_LINE_WIDTHS.emphasis },
        hovertemplate: `x = %{x:.3f} µm<br>value = %{y:.4g} ${phaseField ? "°" : units[component]}<extra>horizontal</extra>`,
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Vertical cut",
        x: plotYUm,
        y: z.map((row) => row[centerColumn]),
        line: { color: "#d55e00", width: PLOT_LINE_WIDTHS.emphasis, dash: "dash" },
        hovertemplate: `y = %{x:.3f} µm<br>value = %{y:.4g} ${phaseField ? "°" : units[component]}<extra>vertical</extra>`,
      },
    ], {
      margin: { l: 56, r: 20, t: 18, b: 50 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font,
      legend: { orientation: "h", x: 0, y: 1.16 },
      xaxis: { ...axisStyle, title: { text: "Transverse position (µm)" } },
      yaxis: { ...axisStyle, title: { text: componentLabel }, range: phaseField ? [-180, 180] : signedField ? [-1.08 * maximum, 1.08 * maximum] : [0, 1.04 * maximum] },
    }, PLOT_CONFIG).then(preparePlotlyToolbar);

    return () => {
      if (fieldRef.current) Plotly.purge(fieldRef.current);
      if (cutRef.current) Plotly.purge(cutRef.current);
    };
  }, [component, part, config, mode, xUm, yUm, displayInterpolation, theme]);

  return (
    <>
      <p id={descriptionId} className="scientific-visually-hidden">{summary}</p>
      <div className="plots" role="group" aria-label={`${plainLabels[component]} profile and central transverse cuts for ${mode.polarization} mode ${mode.order + 1}`}>
        <div ref={fieldRef} className="field-plot scientific-plot-surface" role="img" aria-label={`${plainLabels[component]} field profile`} aria-describedby={descriptionId} />
        <div ref={cutRef} className="cut-plot scientific-plot-surface" role="img" aria-label={`${plainLabels[component]} transverse cuts`} aria-describedby={descriptionId} />
      </div>
      <p className="plot-note">{summary} {displayInterpolation > 1 && `Display grid is ${(xUm.length - 1) * displayInterpolation + 1} × ${(yUm.length - 1) * displayInterpolation + 1} bilinearly interpolated samples; solver accuracy and CSV export remain tied to the original ${xUm.length} × ${yUm.length} Yee grid.`}</p>
    </>
  );
}

function modeMapSummary(component: FieldComponent, part: FieldPart, mode: WaveguideMode, xUm: number[], yUm: number[], values: number[][]): string {
  const finite = values.flat().filter(Number.isFinite);
  const minimum = finite.length ? Math.min(...finite) : Number.NaN;
  const maximum = finite.length ? Math.max(...finite) : Number.NaN;
  const unit = part === "phase" && isPhysicalField(component) ? "degrees" : units[component];
  const partText = isPhysicalField(component) ? `${partLabel(part)} of ${plainLabels[component]}` : plainLabels[component];
  const range = finite.length ? `${formatPlotValue(minimum)} to ${formatPlotValue(maximum)} ${unit}` : "unavailable";
  return `${partText} map for ${mode.polarization} mode ${mode.order + 1}. ${xUm.length} by ${yUm.length} samples spanning x ${formatPlotValue(xUm[0])} to ${formatPlotValue(xUm.at(-1))} micrometres and y ${formatPlotValue(yUm[0])} to ${formatPlotValue(yUm.at(-1))} micrometres. Value range: ${range}.`;
}

function formatPlotValue(value: number | undefined): string {
  return Number.isFinite(value) ? Number(value).toPrecision(5) : "unavailable";
}

function isPhysicalField(component: FieldComponent): component is PhysicalFieldComponent {
  return component !== "intensity" && component !== "poynting";
}

function displayComplexField(field: ComplexFieldMatrix, part: FieldPart): number[][] {
  if (part === "real") return field.real;
  if (part === "imaginary") return field.imaginary;
  return field.real.map((row, rowIndex) => row.map((real, columnIndex) => {
    const imaginary = field.imaginary[rowIndex][columnIndex];
    return part === "magnitude" ? Math.hypot(real, imaginary) : Math.atan2(imaginary, real) * 180 / Math.PI;
  }));
}

function buildDisplayField(
  mode: WaveguideMode, component: FieldComponent, part: FieldPart, x: number[], y: number[], factor: DisplayInterpolation,
): { x: number[]; y: number[]; values: number[][] } {
  if (isPhysicalField(component)) {
    const real = interpolateFieldMatrix(mode.complexFields[component].real, x, y, factor);
    const imaginary = interpolateFieldMatrix(mode.complexFields[component].imaginary, x, y, factor);
    return { x: real.x, y: real.y, values: displayComplexField({ real: real.values, imaginary: imaginary.values }, part) };
  }
  if (factor === 1) return interpolateFieldMatrix(mode.fields[component], x, y, factor);
  return component === "intensity"
    ? interpolatedIntensity(mode, x, y, factor)
    : interpolatedPoynting(mode, x, y, factor);
}

function interpolatedIntensity(mode: WaveguideMode, x: number[], y: number[], factor: DisplayInterpolation) {
  const output = interpolateFieldMatrix(mode.complexFields.Ex.real, x, y, factor);
  const firstReal = output.values;
  output.values = output.values.map((row) => row.map(() => 0));
  for (const component of ["Ex", "Ey", "Ez"] as const) {
    const real = component === "Ex" ? firstReal : interpolateFieldMatrix(mode.complexFields[component].real, x, y, factor).values;
    const imaginary = interpolateFieldMatrix(mode.complexFields[component].imaginary, x, y, factor).values;
    for (let row = 0; row < output.values.length; row += 1) {
      for (let column = 0; column < output.values[row].length; column += 1) {
        output.values[row][column] += real[row][column] ** 2 + imaginary[row][column] ** 2;
      }
    }
  }
  return output;
}

function interpolatedPoynting(mode: WaveguideMode, x: number[], y: number[], factor: DisplayInterpolation) {
  const output = interpolateFieldMatrix(mode.complexFields.Ex.real, x, y, factor);
  const firstElectricReal = output.values;
  output.values = output.values.map((row) => row.map(() => 0));
  for (const [electric, magnetic, sign] of [["Ex", "Hy", 1], ["Ey", "Hx", -1]] as const) {
    const electricReal = electric === "Ex" ? firstElectricReal : interpolateFieldMatrix(mode.complexFields[electric].real, x, y, factor).values;
    const electricImaginary = interpolateFieldMatrix(mode.complexFields[electric].imaginary, x, y, factor).values;
    const magneticReal = interpolateFieldMatrix(mode.complexFields[magnetic].real, x, y, factor).values;
    const magneticImaginary = interpolateFieldMatrix(mode.complexFields[magnetic].imaginary, x, y, factor).values;
    for (let row = 0; row < output.values.length; row += 1) {
      for (let column = 0; column < output.values[row].length; column += 1) {
        output.values[row][column] += 0.5 * sign * (
          electricReal[row][column] * magneticReal[row][column]
          + electricImaginary[row][column] * magneticImaginary[row][column]
        );
      }
    }
  }
  return output;
}

function partLabel(part: FieldPart): string {
  return part === "real" ? "Re" : part === "imaginary" ? "Im" : part === "magnitude" ? "abs" : "arg";
}

function geometryShapes(config: WaveguideConfig): Partial<Plotly.Shape>[] {
  const line = { color: "#4b5563", width: PLOT_LINE_WIDTHS.reference, dash: "dot" as const };
  const rectangle = (x0: number, x1: number, y0: number, y1: number) => ({ type: "rect" as const, x0, x1, y0, y1, line });
  const trapezoid = (centerX: number, topWidth: number, bottomWidth: number, bottomY: number, topY: number) => ({
    type: "path" as const,
    path: `M ${centerX - bottomWidth / 2},${bottomY} L ${centerX + bottomWidth / 2},${bottomY} L ${centerX + topWidth / 2},${topY} L ${centerX - topWidth / 2},${topY} Z`,
    line,
  });
  const geometry = config.geometry ?? "channel";
  if (geometry === "polygon") return (config.polygonRegions ?? []).map((region) => ({
    type: "path" as const,
    path: `${region.vertices.map((vertex, index) => `${index === 0 ? "M" : "L"} ${vertex.xUm},${vertex.yUm}`).join(" ")} Z`,
    line,
  }));
  const etchedHeight = geometry === "rib" ? config.heightUm - (config.slabHeightUm ?? config.heightUm / 2) : config.heightUm;
  const expansion = geometry === "slot" ? 0 : etchedHeight / Math.tan((config.sidewallAngleDeg ?? 90) * Math.PI / 180);
  if (geometry === "slot") {
    const gap = config.slotGapUm ?? config.widthUm / 5;
    return withStackBoundaries([
      rectangle(-config.widthUm / 2, -gap / 2, -config.heightUm / 2, config.heightUm / 2),
      rectangle(gap / 2, config.widthUm / 2, -config.heightUm / 2, config.heightUm / 2),
    ], config, config.widthUm, line);
  }
  if (geometry === "coupler") {
    const gap = config.couplerGapUm ?? config.widthUm / 2;
    const bottomWidth = config.widthUm + 2 * expansion;
    return withStackBoundaries([
      trapezoid(-gap / 2 - config.widthUm / 2, config.widthUm, bottomWidth, -config.heightUm / 2, config.heightUm / 2),
      trapezoid(gap / 2 + config.widthUm / 2, config.widthUm, bottomWidth, -config.heightUm / 2, config.heightUm / 2),
    ], config, 2 * config.widthUm + gap + 2 * expansion, line);
  }
  if (geometry === "rib") {
    const slabTop = -config.heightUm / 2 + (config.slabHeightUm ?? config.heightUm / 2);
    return withStackBoundaries([
      rectangle(-config.paddingUm - config.widthUm / 2 - expansion, config.paddingUm + config.widthUm / 2 + expansion, -config.heightUm / 2, slabTop),
      trapezoid(0, config.widthUm, config.widthUm + 2 * expansion, slabTop, config.heightUm / 2),
    ], config, config.widthUm + 2 * expansion, line);
  }
  const bottomWidth = config.widthUm + 2 * expansion;
  const shapes: Partial<Plotly.Shape>[] = [trapezoid(0, config.widthUm, bottomWidth, -config.heightUm / 2, config.heightUm / 2)];
  return withStackBoundaries(shapes, config, bottomWidth, line);
}

function withStackBoundaries(shapes: Partial<Plotly.Shape>[], config: WaveguideConfig, span: number, line: Partial<Plotly.ShapeLine>): Partial<Plotly.Shape>[] {
  if ((config.geometry ?? "channel") !== "multilayer" && (config.stackLayers?.length ?? 0) === 0) return shapes;
  let boundaryY = -config.heightUm / 2;
  const x0 = -config.paddingUm - span / 2;
  const x1 = config.paddingUm + span / 2;
  shapes.push({ type: "line", x0, x1, y0: boundaryY, y1: boundaryY, line });
  for (const layer of config.stackLayers ?? []) {
    boundaryY -= layer.thicknessUm;
    shapes.push({ type: "line", x0, x1, y0: boundaryY, y1: boundaryY, line });
  }
  return shapes;
}
