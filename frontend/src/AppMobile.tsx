import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import "./theme.css";
import { Loader } from "./components/ui";

// Bouton/geste retour Android : sans ce listener, le WebView Capacitor ne
// réagit pas de façon fiable au retour système — chaque écran (chooser
// Assurances Accidents/Dommages, formulaire, espace client…) doit rester
// accessible en arrière, y compris la toute première étape de souscription
// qui n'a pas de bouton "← Retour" propre (contrairement aux étapes
// suivantes, gérées en interne par Souscription.tsx). `canGoBack` reflète
// l'historique de navigation du WebView ; sans historique (écran d'accueil),
// il n'y a nulle part où revenir → on quitte l'app (comportement standard
// Android). No-op en dehors d'Android (web, iOS non ciblé ici) : le plugin
// n'émet jamais cet évènement hors WebView natif.
function useBoutonRetourAndroid() {
  useEffect(() => {
    const listener = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });
    return () => {
      listener.then((h) => h.remove());
    };
  }, []);
}

// Point d'entrée dédié à l'app mobile (Capacitor) : ne monte que les routes
// publiques de souscription et l'espace client — aucune route admin/
// partenaire/IMF ici, contrairement à App.tsx (site web complet). Objectif :
// un bundle embarqué dans l'APK qui ne contient que ce dont un client final
// a besoin, et qui ne peut pas naviguer vers le back-office même en forgeant
// une URL dans le WebView.
const Home = lazy(() => import("./pages/public/Home"));
const Souscription = lazy(() => import("./pages/public/Souscription"));
const SouscriptionComplement = lazy(() => import("./pages/public/SouscriptionComplement"));
const ClientLogin = lazy(() => import("./pages/client/Login"));
const ClientDashboard = lazy(() => import("./pages/client/Dashboard"));

export default function AppMobile() {
  useBoutonRetourAndroid();
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* Écran d'accueil : choix entre souscrire (sans intermédiaire) et
              se connecter à son espace client existant. */}
          <Route path="/" element={<Home />} />

          <Route path="/souscription/:token" element={<Souscription />} />
          <Route path="/s/:produit/complement/:token" element={<SouscriptionComplement />} />
          <Route path="/s/:produit/:token" element={<Souscription />} />

          <Route path="/client/connexion" element={<ClientLogin />} />
          <Route path="/client" element={<ClientDashboard />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
