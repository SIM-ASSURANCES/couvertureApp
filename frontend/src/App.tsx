import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./theme.css";
import { AuthProvider, RequireAuth } from "./auth";
import { Loader } from "./components/ui";

import Login from "./pages/Login";

// Découpage par chargement paresseux (audit perf 2026-09-11) : sans lui,
// un visiteur public qui scanne un QR pour souscrire téléchargeait dans le
// même bundle initial tout le back-office admin (dont des pages de
// plusieurs milliers de lignes) — chaque page ci-dessous devient son propre
// chunk, chargé seulement quand la route est visitée.
const Souscription = lazy(() => import("./pages/public/Souscription"));
const SouscriptionComplement = lazy(() => import("./pages/public/SouscriptionComplement"));
const SimulationImfPublique = lazy(() => import("./pages/public/SimulationImf"));
const ClientLogin = lazy(() => import("./pages/client/Login"));
const ClientDashboard = lazy(() => import("./pages/client/Dashboard"));
const AgentDistributionLogin = lazy(() => import("./pages/agent-distribution/Login"));
const AgentDistributionDashboard = lazy(() => import("./pages/agent-distribution/Dashboard"));

const AdminLayout = lazy(() => import("./components/layout/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Partenaires = lazy(() => import("./pages/admin/Partenaires"));
const Carte = lazy(() => import("./pages/admin/Carte"));
const ClientsIncendie = lazy(() => import("./pages/admin/ClientsIncendie"));
const ClientsAccident = lazy(() => import("./pages/admin/ClientsAccident"));
const PaiementsEnAttente = lazy(() => import("./pages/admin/PaiementsEnAttente"));
const Contrats = lazy(() => import("./pages/admin/Contrats"));
const Sinistres = lazy(() => import("./pages/admin/Sinistres"));
const Performance = lazy(() => import("./pages/admin/Performance"));
const Journal = lazy(() => import("./pages/admin/Journal"));
const Administrateurs = lazy(() => import("./pages/admin/Administrateurs"));
const Parametres = lazy(() => import("./pages/admin/Parametres"));
const AdminProfil = lazy(() => import("./pages/admin/Profil"));

const AssurancesAccidentsClients = lazy(() => import("./pages/admin/accidents/Clients"));
const AssurancesAccidentsTarifs = lazy(() => import("./pages/admin/accidents/Tarifs"));
const ConditionsGenerales = lazy(() => import("./pages/admin/ConditionsGenerales"));
const RelaxDashboard = lazy(() => import("./pages/admin/relax/Dashboard"));
const RelaxPartenaires = lazy(() => import("./pages/admin/relax/Partenaires"));
const ClientsRelaxMoto = lazy(() => import("./pages/admin/relax/ClientsRelaxMoto"));
const ClientsRelaxAuto = lazy(() => import("./pages/admin/relax/ClientsRelaxAuto"));
const RelaxPaiementsEnAttente = lazy(() => import("./pages/admin/relax/PaiementsEnAttente"));
const RelaxContrats = lazy(() => import("./pages/admin/relax/Contrats"));
const RelaxPerformance = lazy(() => import("./pages/admin/relax/Performance"));

const ImfDashboard = lazy(() => import("./pages/admin/imf/Dashboard"));
const ImfPartenairesDashboard = lazy(() => import("./pages/admin/imfs/Dashboard"));
const ImfPartenairesListe = lazy(() => import("./pages/admin/imfs/Liste"));
const ImfFicheLayout = lazy(() => import("./pages/admin/imfs/Fiche"));
// OngletRoutes.tsx n'a que des exports nommés (pas de défaut) — la forme
// `.then(m => ({ default: m.X }))` est la façon standard de lazy-charger un
// export nommé avec React.lazy ; les 8 composants partagent le même chunk
// (un seul module importé), c'est voulu, ils ne sont utilisés qu'ensemble.
const ImfRouteTableauDeBord = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteTableauDeBord }))
);
const ImfRouteGeneral = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteGeneral }))
);
const ImfRouteReseau = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteReseau }))
);
const ImfRouteSimulateur = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteSimulateur }))
);
const ImfRoutePortefeuille = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RoutePortefeuille }))
);
const ImfRouteProduits = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteProduits }))
);
const ImfRouteBaremes = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteBaremes }))
);
const ImfRouteDocuments = lazy(() =>
  import("./pages/admin/imfs/fiche/OngletRoutes").then((m) => ({ default: m.RouteDocuments }))
);
const ImfZones = lazy(() => import("./pages/admin/imf/Zones"));
const ImfAgences = lazy(() => import("./pages/admin/imf/Agences"));
const ImfAgents = lazy(() => import("./pages/admin/imf/Agents"));
const ImfBaremes = lazy(() => import("./pages/admin/imf/Baremes"));
const ImfIndiceArc = lazy(() => import("./pages/admin/imf/IndiceArc"));
const ImfSimulateur = lazy(() => import("./pages/admin/imf/Simulateur"));
const ImfContrats = lazy(() => import("./pages/admin/imf/Contrats"));
const ImfSinistres = lazy(() => import("./pages/admin/imf/Sinistres"));
const ImfBordereaux = lazy(() => import("./pages/admin/imf/Bordereaux"));

const PartenaireLayout = lazy(() => import("./components/layout/PartenaireLayout"));
const PartenaireDashboard = lazy(() => import("./pages/partenaire/Dashboard"));
const PartenaireSouscriptions = lazy(() => import("./pages/partenaire/Souscriptions"));
const PartenaireCommissions = lazy(() => import("./pages/partenaire/Commissions"));
const PartenaireQr = lazy(() => import("./pages/partenaire/QrCode"));
const PartenaireProfil = lazy(() => import("./pages/partenaire/Profil"));
const PartenaireAgents = lazy(() => import("./pages/partenaire/Agents"));

const AgentImfLayout = lazy(() => import("./components/layout/AgentImfLayout"));
const AgentImfDashboard = lazy(() => import("./pages/agent-imf/Dashboard"));
const AgentImfSimulateur = lazy(() => import("./pages/agent-imf/Simulateur"));
const AgentImfContrats = lazy(() => import("./pages/agent-imf/Contrats"));
const AgentImfSinistres = lazy(() => import("./pages/agent-imf/Sinistres"));
const AgentImfFinance = lazy(() => import("./pages/agent-imf/Finance"));
const AgentImfReseauZone = lazy(() => import("./pages/agent-imf/ReseauZone"));
const AgentImfReseauAgence = lazy(() => import("./pages/agent-imf/ReseauAgence"));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Login />} />

            <Route
              path="/admin"
              element={
                <RequireAuth type="admin">
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="partenaires" element={<Partenaires />} />
              <Route path="carte" element={<Carte />} />
              <Route path="incendie" element={<ClientsIncendie />} />
              <Route path="accident" element={<ClientsAccident />} />
              <Route path="paiements-en-attente" element={<PaiementsEnAttente />} />
              <Route path="contrats" element={<Contrats />} />
              <Route path="sinistres" element={<Sinistres />} />
              <Route path="performance" element={<Performance />} />
              <Route path="journal" element={<Journal />} />
              <Route path="administrateurs" element={<Administrateurs />} />
              <Route path="parametres" element={<Parametres />} />
              <Route path="profil" element={<AdminProfil />} />

              <Route path="clients-accidents" element={<AssurancesAccidentsClients />} />
              <Route path="tarifs-accidents" element={<AssurancesAccidentsTarifs />} />
              <Route path="conditions-generales" element={<ConditionsGenerales />} />

              <Route path="relax" element={<RelaxDashboard />} />
              <Route path="relax/partenaires" element={<RelaxPartenaires />} />
              <Route path="relax/moto" element={<ClientsRelaxMoto />} />
              <Route path="relax/auto" element={<ClientsRelaxAuto />} />
              <Route path="relax/paiements-en-attente" element={<RelaxPaiementsEnAttente />} />
              <Route path="relax/contrats" element={<RelaxContrats />} />
              <Route path="relax/performance" element={<RelaxPerformance />} />

              <Route path="imf" element={<ImfDashboard />} />
              <Route path="imfs" element={<ImfPartenairesDashboard />} />
              <Route path="imfs/liste" element={<ImfPartenairesListe />} />
              <Route path="imfs/:imfId" element={<ImfFicheLayout />}>
                <Route index element={<Navigate to="tableau-de-bord" replace />} />
                <Route path="tableau-de-bord" element={<ImfRouteTableauDeBord />} />
                <Route path="general" element={<ImfRouteGeneral />} />
                <Route path="reseau" element={<ImfRouteReseau />} />
                <Route path="simulateur" element={<ImfRouteSimulateur />} />
                <Route path="portefeuille" element={<ImfRoutePortefeuille />} />
                <Route path="produits" element={<ImfRouteProduits />} />
                <Route path="baremes" element={<ImfRouteBaremes />} />
                <Route path="documents" element={<ImfRouteDocuments />} />
              </Route>
              <Route path="imf/zones" element={<ImfZones />} />
              <Route path="imf/agences" element={<ImfAgences />} />
              <Route path="imf/agents" element={<ImfAgents />} />
              <Route path="imf/baremes" element={<ImfBaremes />} />
              <Route path="imf/indice-arc" element={<ImfIndiceArc />} />
              <Route path="imf/simulateur" element={<ImfSimulateur />} />
              <Route path="imf/contrats" element={<ImfContrats />} />
              <Route path="imf/sinistres" element={<ImfSinistres />} />
              <Route path="imf/bordereaux" element={<ImfBordereaux />} />
            </Route>

            <Route
              path="/partenaire"
              element={
                <RequireAuth type="partenaire">
                  <PartenaireLayout />
                </RequireAuth>
              }
            >
              <Route index element={<PartenaireDashboard />} />
              <Route path="souscriptions" element={<PartenaireSouscriptions />} />
              <Route path="commissions" element={<PartenaireCommissions />} />
              <Route path="qr" element={<PartenaireQr />} />
              <Route path="agents" element={<PartenaireAgents />} />
              <Route path="profil" element={<PartenaireProfil />} />
            </Route>

            <Route
              path="/agent-imf"
              element={
                <RequireAuth type="agent_imf">
                  <AgentImfLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AgentImfDashboard />} />
              <Route path="simulateur" element={<AgentImfSimulateur />} />
              <Route path="contrats" element={<AgentImfContrats />} />
              <Route path="sinistres" element={<AgentImfSinistres />} />
              <Route path="finance" element={<AgentImfFinance />} />
              <Route path="reseau-zone" element={<AgentImfReseauZone />} />
              <Route path="reseau-agence" element={<AgentImfReseauAgence />} />
            </Route>

            <Route path="/souscription/:token" element={<Souscription />} />
            <Route path="/s/:produit/complement/:token" element={<SouscriptionComplement />} />
            <Route path="/s/:produit/:token" element={<Souscription />} />
            <Route path="/imf/:token" element={<SimulationImfPublique />} />

            <Route path="/client/connexion" element={<ClientLogin />} />
            <Route path="/client" element={<ClientDashboard />} />

            <Route path="/agent-distribution/connexion" element={<AgentDistributionLogin />} />
            <Route path="/agent-distribution" element={<AgentDistributionDashboard />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
