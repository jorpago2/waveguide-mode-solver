import type Plotly from "plotly.js-cartesian-dist-min";
import {
  SCIENTIFIC_PLOT_FONT,
  SCIENTIFIC_PLOT_LINE_WIDTHS,
  createScientificPlotlyAxis,
  createScientificPlotlyConfig,
  prepareScientificPlotlyToolbar,
  type ScientificPlotTheme,
} from "@jorpago2/scientific-ui";

export function createPlotFont(theme: ScientificPlotTheme): Partial<Plotly.Font> {
  return {
    family: SCIENTIFIC_PLOT_FONT,
    color: theme.textSecondary,
    size: 12,
  };
}

export function createPlotAxis(theme: ScientificPlotTheme): Partial<Plotly.LayoutAxis> {
  return createScientificPlotlyAxis(theme) as Partial<Plotly.LayoutAxis>;
}

export const PLOT_CONFIG = createScientificPlotlyConfig({
  filename: "scientific-plot",
  scrollZoom: false,
}) as Partial<Plotly.Config>;

export const preparePlotlyToolbar = prepareScientificPlotlyToolbar;
export const PLOT_LINE_WIDTHS = SCIENTIFIC_PLOT_LINE_WIDTHS;
