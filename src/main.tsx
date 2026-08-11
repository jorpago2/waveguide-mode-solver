import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScientificUiProvider } from "@jorpago2/scientific-ui";
import { App } from "./App";
import "./carbon.scss";
import "./styles.css";
import "@jorpago2/scientific-ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScientificUiProvider><App /></ScientificUiProvider>
  </StrictMode>,
);
