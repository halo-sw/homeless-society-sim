// React entry: mounts the Astryx UI over the 3D canvas.
//
// Light theme default. The scene calls mountUI() once at boot; the UI
// renders purely from the store afterwards.
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "@astryxdesign/theme-neutral/fonts.css";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import "./ui.css";
import { store } from "./store.js";
import { App } from "./app.jsx";

let mounted = false;

function FirstVisit() {
  useEffect(() => {
    try {
      if (!localStorage.getItem("consult-seen")) {
        localStorage.setItem("consult-seen", "1");
        store.set({ consultOpen: true });
      }
    } catch { /* private mode: stay closed */ }
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
  const el = document.getElementById("ui-root");
  if (!el) return;
  createRoot(el).render(
    <StrictMode>
      <Theme theme={neutralTheme} mode="light">
        <FirstVisit />
        <App />
      </Theme>
    </StrictMode>,
  );
}
