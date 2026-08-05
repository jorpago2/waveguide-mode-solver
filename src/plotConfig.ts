import Plotly from "plotly.js-cartesian-dist-min";

const fullscreenIcon = {
  width: 24, height: 24, ascent: 24, descent: 0,
  path: "M3 9V3h6v2H5v4H3zm12-6h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 0h2v6h-6v-2h4v-4z",
};

let fullscreenPlot: Plotly.PlotlyHTMLElement | null = null;

function closePlotFullscreen() {
  if (!fullscreenPlot) return;
  const plot = fullscreenPlot;
  fullscreenPlot = null;
  plot.classList.remove("plot-fullscreen");
  document.body.classList.remove("plot-fullscreen-open");
  document.removeEventListener("keydown", closeFullscreenOnEscape);
  Plotly.Plots.resize(plot);
}

function closeFullscreenOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") closePlotFullscreen();
}

function openPlotFullscreen(plot: Plotly.PlotlyHTMLElement) {
  fullscreenPlot = plot;
  plot.classList.add("plot-fullscreen");
  document.body.classList.add("plot-fullscreen-open");
  document.addEventListener("keydown", closeFullscreenOnEscape);
  Plotly.Plots.resize(plot);
}

function togglePlotFullscreen(plot: Plotly.PlotlyHTMLElement) {
  if (fullscreenPlot === plot) closePlotFullscreen();
  else openPlotFullscreen(plot);
}

function handleFullscreenButton(event: MouseEvent) {
  const path = event.composedPath() as Element[];
  const fullscreenClick = path.some((element) => element.getAttribute?.("data-title") === "Toggle fullscreen");
  const plot = path.find((element) => element.classList?.contains("js-plotly-plot")) as Plotly.PlotlyHTMLElement | undefined;
  if (fullscreenClick && plot) togglePlotFullscreen(plot);
}

if (typeof document !== "undefined") document.addEventListener("click", handleFullscreenButton, true);

export const PLOT_CONFIG: Partial<Plotly.Config> = {
  displaylogo: false,
  responsive: true,
  scrollZoom: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
  toImageButtonOptions: { format: "svg", filename: "scientific-plot", width: 1200, height: 650, scale: 1 },
  modeBarButtonsToAdd: [{
    name: "fullscreen",
    title: "Toggle fullscreen",
    icon: fullscreenIcon,
    click: () => undefined,
  }],
};
