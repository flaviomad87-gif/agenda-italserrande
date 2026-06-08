import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import Login from "./pages/Login";
import Register from "./pages/Register";

// Code-splitting: queste pagine sono caricate solo quando servono
const AppShell = lazy(() => import("./layouts/AppShell"));
const Agenda = lazy(() => import("./pages/Agenda"));
const ProssimiLavori = lazy(() => import("./pages/ProssimiLavori"));
const InAttesa = lazy(() => import("./pages/InAttesa"));
const Incassi = lazy(() => import("./pages/Incassi"));
const Spese = lazy(() => import("./pages/Spese"));
const Riepilogo = lazy(() => import("./pages/Riepilogo"));
const Profilo = lazy(() => import("./pages/Profilo"));

const FullPageSpinner = () => (
  <div className="flex h-screen items-center justify-center text-stone-500">Caricamento…</div>
);

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-stone-500">
        Caricamento…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/agenda" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
              <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
              <Route
                element={
                  <Protected>
                    <AppShell />
                  </Protected>
                }
              >
                <Route path="/" element={<Navigate to="/prossimi-lavori" replace />} />
                <Route path="/agenda" element={<Agenda />} />
                <Route path="/prossimi-lavori" element={<ProssimiLavori />} />
                <Route path="/in-attesa" element={<InAttesa />} />
                <Route path="/incassi" element={<Incassi />} />
                <Route path="/spese" element={<Spese />} />
                <Route path="/riepilogo" element={<Riepilogo />} />
                <Route path="/profilo" element={<Profilo />} />
              </Route>
              <Route path="*" element={<Navigate to="/prossimi-lavori" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </div>
  );
}

export default App;
