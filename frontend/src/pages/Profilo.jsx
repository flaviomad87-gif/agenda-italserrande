import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { LogOut, Mail, Download, Smartphone, Palette, Check, Printer } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { THEMES, getSavedTheme, applyTheme } from "../lib/themes";

const MONTHS = [
  { value: "01", label: "Gennaio" },
  { value: "02", label: "Febbraio" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Aprile" },
  { value: "05", label: "Maggio" },
  { value: "06", label: "Giugno" },
  { value: "07", label: "Luglio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Settembre" },
  { value: "10", label: "Ottobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Dicembre" },
];

export default function Profilo() {
  const { user, logout } = useAuth();
  const [installEvent, setInstallEvent] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme());
  const now = new Date();
  const [printMonth, setPrintMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [printYear, setPrintYear] = useState(String(now.getFullYear()));
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));

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

      <div className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm" data-testid="theme-picker">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-[#4A5D23]" />
          <h2 className="font-display text-lg font-semibold">Aspetto</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Scegli il tema che preferisci. La modifica è immediata.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEMES.map((t) => {
            const selected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  applyTheme(t.id);
                  setCurrentTheme(t.id);
                  toast.success(`Tema: ${t.label}`);
                }}
                data-testid={`theme-${t.id}`}
                className={`group relative flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  selected
                    ? "border-[#4A5D23] bg-[#EAF3EF] shadow-sm"
                    : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                }`}
              >
                <div className="flex shrink-0 gap-1">
                  {t.swatch.map((c, idx) => (
                    <span
                      key={idx}
                      style={{ backgroundColor: c }}
                      className="h-8 w-4 rounded-sm ring-1 ring-black/10"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                    {t.label}
                    {t.isDark && (
                      <span className="rounded-full bg-stone-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white">
                        Scuro
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500">{t.description}</div>
                </div>
                {selected && (
                  <Check className="absolute right-2 top-2 h-4 w-4 text-[#4A5D23]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm" data-testid="print-archive-card">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-[#4A5D23]" />
          <h2 className="font-display text-lg font-semibold">Stampa archivio lavori</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Scegli il mese: aprirà l&apos;elenco dei lavori eseguiti pronto da stampare o salvare in PDF.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[8rem]">
            <label className="block text-xs font-semibold uppercase tracking-widest text-stone-500">
              Mese
            </label>
            <select
              value={printMonth}
              onChange={(e) => setPrintMonth(e.target.value)}
              data-testid="archive-month-select"
              className="mt-2 h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[6rem]">
            <label className="block text-xs font-semibold uppercase tracking-widest text-stone-500">
              Anno
            </label>
            <select
              value={printYear}
              onChange={(e) => setPrintYear(e.target.value)}
              data-testid="archive-year-select"
              className="mt-2 h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Link
            to={`/archivio/${printYear}-${printMonth}`}
            data-testid="open-archive-button"
            className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-[#4A5D23] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3C4B1C]"
          >
            <Printer className="h-4 w-4" /> Apri archivio
          </Link>
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
