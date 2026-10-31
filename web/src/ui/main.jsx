// React entry: mounts the Astryx UI over the 3D canvas.
//
// Light theme default. The scene calls mountUI() once at boot; the UI
// renders purely from the store afterwards.
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { LayerProvider } from "@astryxdesign/core/Layer";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { themes, defaultThemeSlug } from "../astryx-themes.js";
import "./ui.css";
import { store } from "./store.js";
import { App } from "./app.jsx";
import { initI18n } from "../i18n/index.js";

let mounted = false;

// Stage 11: the agent panel stays closed until the customer opens it
// (the old first-visit auto-open covered the cards on every fresh
// profile). Open/closed persists per viewer via the boot (agent-float.js).
function FirstVisit() {
  useEffect(() => {
    const timer = setInterval(() => {
      if (store.getState().viewChip) store.set({ viewChip: "" });
    }, 8000);
    return () => clearInterval(timer);
  }, []);
  return null;
}

export function mountUI() {
  if (mounted) return;
  mounted = true;
  initI18n();
  const el = document.getElementById("ui-root");
  if (!el) return;
  createRoot(el).render(
    <StrictMode>
      <Theme theme={themes[defaultThemeSlug]} mode="light">
        <LayerProvider>
          <FirstVisit />
          <App />
        </LayerProvider>
      </Theme>
    </StrictMode>,
  );
}
