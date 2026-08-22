import type Plotly from "plotly.js-cartesian-dist-min";
import {
  SCIENTIFIC_PLOT_FONT,
  SCIENTIFIC_PLOT_LINE_WIDTHS,
  createScientificPlotlyAxis,
  createScientificPlotlyConfig,
  prepareScientificPlotlyToolbar,
  type ScientificPlotTheme,
} from "@jorpago2/scientific-ui";

export function createPlotFont(_theme: ScientificPlotTheme): Partial<Plotly.Font> {
  return {
    family: SCIENTIFIC_PLOT_FONT,
    // Plotly figures are scientific paper surfaces, so their typography and
    // axes do not change when the Carbon shell switches between g10 and g100.
    color: "#1f2933",
    size: 12,
  };
}

export function createPlotAxis(_theme: ScientificPlotTheme): Partial<Plotly.LayoutAxis> {
  const paperTheme: ScientificPlotTheme = {
    background: "#ffffff",
    layer: "#ffffff",
    grid: "#d9dee4",
    axis: "#1f2933",
    text: "#1f2933",
    textSecondary: "#4b5563",
    focus: "#0072ce",
  };
  const axis = createScientificPlotlyAxis(paperTheme) as Partial<Plotly.LayoutAxis>;
  return { ...axis, color: "#1f2933", gridcolor: "#d9dee4", zerolinecolor: "#9aa5b1" };
}

export const PLOT_CONFIG = createScientificPlotlyConfig({
  filename: "scientific-plot",
  scrollZoom: false,
}) as Partial<Plotly.Config>;

export const preparePlotlyToolbar = prepareScientificPlotlyToolbar;
export const PLOT_LINE_WIDTHS = SCIENTIFIC_PLOT_LINE_WIDTHS;
