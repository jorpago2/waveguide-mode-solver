import type Plotly from "plotly.js-cartesian-dist-min";
import {
  SCIENTIFIC_PLOT_FONT,
  createScientificPlotlyAxis,
  createScientificPlotlyConfig,
  prepareScientificPlotlyToolbar,
  readScientificPlotTheme,
} from "@jorpago2/scientific-ui";

const theme = readScientificPlotTheme();

export const PLOT_FONT: Partial<Plotly.Font> = {
  family: SCIENTIFIC_PLOT_FONT,
  color: theme.textSecondary,
  size: 12,
};

export const PLOT_AXIS = createScientificPlotlyAxis(theme) as Partial<Plotly.LayoutAxis>;

export const PLOT_CONFIG = createScientificPlotlyConfig({
  filename: "scientific-plot",
  scrollZoom: false,
}) as Partial<Plotly.Config>;

export const preparePlotlyToolbar = prepareScientificPlotlyToolbar;
