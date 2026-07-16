import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker (cache de l'app shell pour le mode hors-ligne de l'espace
// agent IMF) — uniquement en production, pour ne pas interférer avec le
// rechargement à chaud du serveur de dev Vite.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* mode hors-ligne simplement indisponible, l'appli reste utilisable en ligne */
    });
  });
}
