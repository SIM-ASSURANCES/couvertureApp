import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./theme.css";
import { AuthProvider, RequireAuth } from "./auth";

import Login from "./pages/Login";
import Souscription from "./pages/public/Souscription";

import AdminLayout from "./components/layout/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import Partenaires from "./pages/admin/Partenaires";
import ClientsIncendie from "./pages/admin/ClientsIncendie";
import ClientsAccident from "./pages/admin/ClientsAccident";
import Performance from "./pages/admin/Performance";
import Journal from "./pages/admin/Journal";
import Administrateurs from "./pages/admin/Administrateurs";
import Parametres from "./pages/admin/Parametres";

import PartenaireLayout from "./components/layout/PartenaireLayout";
import PartenaireDashboard from "./pages/partenaire/Dashboard";
import PartenaireSouscriptions from "./pages/partenaire/Souscriptions";
import PartenaireCommissions from "./pages/partenaire/Commissions";
import PartenaireQr from "./pages/partenaire/QrCode";

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
            <Route path="performance" element={<Performance />} />
            <Route path="journal" element={<Journal />} />
            <Route path="administrateurs" element={<Administrateurs />} />
            <Route path="parametres" element={<Parametres />} />
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
          </Route>

          <Route path="/souscription/:token" element={<Souscription />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
