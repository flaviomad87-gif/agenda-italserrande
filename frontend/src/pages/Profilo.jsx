import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { LogOut, Mail, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export default function Profilo() {
  const { user, logout } = useAuth();
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onLogout = async () => {
    try {
      await logout();
      toast.success("Disconnesso");
    } catch {
      toast.error("Errore durante la disconnessione");
    }
  };

  const onInstall = async () => {
    if (!installEvent) {
      toast.info("L'opzione di installazione apparirà quando il browser lo permetterà.");
      return;
    }
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") toast.success("App installata");
    setInstallEvent(null);
  };

  return (
    <div className="space-y-6 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Profilo</div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Il tuo account</h1>
      </header>

      <div className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE7DE] font-display text-xl font-bold text-[#4A5D23]">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold">{user?.email}</div>
            <div className="text-xs text-stone-500">Utente Firebase autenticato</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Installa come app</h2>
        <p className="mt-1 text-sm text-stone-500">
          Aggiungi Agenda Italserrande alla schermata principale per usarla a schermo intero, anche da mobile.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={onInstall}
            data-testid="install-pwa-button"
            className="h-12 rounded-xl bg-[#4A5D23] text-white hover:bg-[#3C4B1C]"
          >
            <Download className="mr-2 h-4 w-4" /> Installa app
          </Button>
          <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600 sm:flex-1">
            <div className="flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4" /> Su iPhone
            </div>
            <div className="mt-1">Tocca <strong>Condividi</strong> e poi <strong>“Aggiungi a Home”</strong>.</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Account</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <Mail className="h-4 w-4 text-stone-400" /> {user?.email}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onLogout}
          data-testid="logout-button"
          className="mt-5 h-12 w-full rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </div>
    </div>
  );
}
