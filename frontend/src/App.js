import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AppShell from "./layouts/AppShell";
import Agenda from "./pages/Agenda";
import Spese from "./pages/Spese";
import Riepilogo from "./pages/Riepilogo";
import Profilo from "./pages/Profilo";

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
              <Route path="/" element={<Navigate to="/agenda" replace />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/spese" element={<Spese />} />
              <Route path="/riepilogo" element={<Riepilogo />} />
              <Route path="/profilo" element={<Profilo />} />
            </Route>
            <Route path="*" element={<Navigate to="/agenda" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </div>
  );
}

export default App;
