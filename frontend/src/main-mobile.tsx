import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppMobile from "./AppMobile.tsx";
import "./theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppMobile />
  </StrictMode>
);

// Pas de service worker ici : ce build est embarqué localement dans l'app
// Android (Capacitor), il n'a pas besoin du cache hors-ligne conçu pour
// l'espace agent IMF (sw.js, voir main.tsx du site web).
