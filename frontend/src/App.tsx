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

import PartenaireLayout from "./components/layout/PartenaireLayout";
import PartenaireDashboard from "./pages/partenaire/Dashboard";
import PartenaireSouscriptions from "./pages/partenaire/Souscriptions";
import PartenaireCommissions from "./pages/partenaire/Commissions";
import PartenaireQr from "./pages/partenaire/QrCode";
import PartenaireProfil from "./pages/partenaire/Profil";

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

          <Route path="/souscription/:token" element={<Souscription />} />
          <Route path="/s/:produit/complement/:token" element={<SouscriptionComplement />} />
          <Route path="/s/:produit/:token" element={<Souscription />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
