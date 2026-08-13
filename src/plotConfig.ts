import type Plotly from "plotly.js-cartesian-dist-min";
import PlotlyRuntime from "plotly.js-cartesian-dist-min";
import {
  SCIENTIFIC_PLOT_FONT,
  SCIENTIFIC_PLOT_LINE_WIDTHS,
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

function synchronizeRenderedPlots() {
  const next = readScientificPlotTheme();
  document.querySelectorAll<HTMLElement>(".scientific-plot-surface.js-plotly-plot").forEach((plot) => {
    const update: Record<string, unknown> = {
      "font.family": SCIENTIFIC_PLOT_FONT,
      "font.color": next.textSecondary,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      ...Object.fromEntries(["xaxis", "xaxis2", "yaxis", "yaxis2"].flatMap((axis) => [
        [`${axis}.color`, next.textSecondary],
        [`${axis}.gridcolor`, next.grid],
        [`${axis}.linecolor`, next.axis],
        [`${axis}.zerolinecolor`, next.axis],
      ])),
    };
    void PlotlyRuntime.relayout(plot, update as Partial<Plotly.Layout>);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("scientific-ui:theme-applied", synchronizeRenderedPlots);
}

export const PLOT_CONFIG = createScientificPlotlyConfig({
  filename: "scientific-plot",
  scrollZoom: false,
}) as Partial<Plotly.Config>;

export const preparePlotlyToolbar = prepareScientificPlotlyToolbar;
export const PLOT_LINE_WIDTHS = SCIENTIFIC_PLOT_LINE_WIDTHS;
