import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./theme.css";
import { AuthProvider, RequireAuth } from "./auth";

import Login from "./pages/Login";
import Souscription from "./pages/public/Souscription";
import SouscriptionComplement from "./pages/public/SouscriptionComplement";

import AdminLayout from "./components/layout/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import Partenaires from "./pages/admin/Partenaires";
import ClientsIncendie from "./pages/admin/ClientsIncendie";
import ClientsAccident from "./pages/admin/ClientsAccident";
import PaiementsEnAttente from "./pages/admin/PaiementsEnAttente";
import Contrats from "./pages/admin/Contrats";
import Performance from "./pages/admin/Performance";
import Journal from "./pages/admin/Journal";
import Administrateurs from "./pages/admin/Administrateurs";
import Parametres from "./pages/admin/Parametres";
import AdminProfil from "./pages/admin/Profil";

import RelaxDashboard from "./pages/admin/relax/Dashboard";
import RelaxPartenaires from "./pages/admin/relax/Partenaires";
import ClientsRelaxMoto from "./pages/admin/relax/ClientsRelaxMoto";
import ClientsRelaxAuto from "./pages/admin/relax/ClientsRelaxAuto";
import RelaxPaiementsEnAttente from "./pages/admin/relax/PaiementsEnAttente";
import RelaxContrats from "./pages/admin/relax/Contrats";
import RelaxPerformance from "./pages/admin/relax/Performance";

import ImfDashboard from "./pages/admin/imf/Dashboard";
import ImfZones from "./pages/admin/imf/Zones";
import ImfAgences from "./pages/admin/imf/Agences";
import ImfAgents from "./pages/admin/imf/Agents";
import ImfBaremes from "./pages/admin/imf/Baremes";
import ImfIndiceArc from "./pages/admin/imf/IndiceArc";
import ImfSouscriptions from "./pages/admin/imf/Souscriptions";
import ImfSimulateur from "./pages/admin/imf/Simulateur";
import ImfContrats from "./pages/admin/imf/Contrats";

import PartenaireLayout from "./components/layout/PartenaireLayout";
import PartenaireDashboard from "./pages/partenaire/Dashboard";
import PartenaireSouscriptions from "./pages/partenaire/Souscriptions";
import PartenaireCommissions from "./pages/partenaire/Commissions";
import PartenaireQr from "./pages/partenaire/QrCode";
import PartenaireProfil from "./pages/partenaire/Profil";

import AgentImfLayout from "./components/layout/AgentImfLayout";
import AgentImfDashboard from "./pages/agent-imf/Dashboard";
import AgentImfSimulateur from "./pages/agent-imf/Simulateur";
import AgentImfSouscriptions from "./pages/agent-imf/Souscriptions";
import AgentImfContrats from "./pages/agent-imf/Contrats";
import AgentImfReseauZone from "./pages/agent-imf/ReseauZone";
import AgentImfReseauAgence from "./pages/agent-imf/ReseauAgence";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="incendie" element={<ClientsIncendie />} />
            <Route path="accident" element={<ClientsAccident />} />
            <Route path="paiements-en-attente" element={<PaiementsEnAttente />} />
            <Route path="contrats" element={<Contrats />} />
            <Route path="performance" element={<Performance />} />
            <Route path="journal" element={<Journal />} />
            <Route path="administrateurs" element={<Administrateurs />} />
            <Route path="parametres" element={<Parametres />} />
            <Route path="profil" element={<AdminProfil />} />

            <Route path="relax" element={<RelaxDashboard />} />
            <Route path="relax/partenaires" element={<RelaxPartenaires />} />
            <Route path="relax/moto" element={<ClientsRelaxMoto />} />
            <Route path="relax/auto" element={<ClientsRelaxAuto />} />
            <Route path="relax/paiements-en-attente" element={<RelaxPaiementsEnAttente />} />
            <Route path="relax/contrats" element={<RelaxContrats />} />
            <Route path="relax/performance" element={<RelaxPerformance />} />

            <Route path="imf" element={<ImfDashboard />} />
            <Route path="imf/zones" element={<ImfZones />} />
            <Route path="imf/agences" element={<ImfAgences />} />
            <Route path="imf/agents" element={<ImfAgents />} />
            <Route path="imf/baremes" element={<ImfBaremes />} />
            <Route path="imf/indice-arc" element={<ImfIndiceArc />} />
            <Route path="imf/simulateur" element={<ImfSimulateur />} />
            <Route path="imf/souscriptions" element={<ImfSouscriptions />} />
            <Route path="imf/contrats" element={<ImfContrats />} />
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
            <Route path="souscriptions" element={<AgentImfSouscriptions />} />
            <Route path="contrats" element={<AgentImfContrats />} />
            <Route path="reseau-zone" element={<AgentImfReseauZone />} />
            <Route path="reseau-agence" element={<AgentImfReseauAgence />} />
          </Route>

          <Route path="/souscription/:token" element={<Souscription />} />
          <Route path="/s/:produit/complement/:token" element={<SouscriptionComplement />} />
          <Route path="/s/:produit/:token" element={<Souscription />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
