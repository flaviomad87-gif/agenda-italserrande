import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BellRing, Bot, Plus } from "lucide-react";
import AssistenteChat from "../components/AssistenteChat";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { api, apiGetWithCache } from "../lib/api";
import { auth } from "../lib/firebase";
import OfflineBanner from "../components/OfflineBanner";
import AreaTabs from "../components/AreaTabs";
import BottomSheet, { SheetTile } from "../components/BottomSheet";
import { createQuote } from "../components/PreventiviAppSection";
import { AREAS, NEW_ACTIONS, areaOf } from "./navConfig";

const Badge = ({ n, testId }) =>
  n > 0 ? (
    <span
      data-testid={testId}
      className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#B8683D] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
    >
      {n > 99 ? "99+" : n}
    </span>
  ) : null;

const SideItem = ({ to, label, icon: Icon, testId, badge }) => (
  <NavLink
    to={to}
    data-testid={testId}
    className={({ isActive }) =>
      cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        isActive ? "bg-[#EAE7DE] text-[#1C1C1A]" : "text-stone-500 hover:text-[#1C1C1A]",
      )
    }
  >
    <Icon className="h-4 w-4" />
    <span className="truncate">{label}</span>
    {badge > 0 && <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white" data-testid={`${testId}-badge`}>{badge}</span>}
  </NavLink>
);

const BarButton = ({ area, active, badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={`bar-${area.key}`}
    className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors", active ? "text-[#4A5D23]" : "text-stone-500")}
  >
    <span className="relative">
      <area.icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
      <Badge n={badge} testId={`bar-${area.key}-badge`} />
    </span>
    <span className="truncate">{area.label}</span>
  </button>
);

export default function AppShell() {
  // Precarica in sottofondo le pagine principali: poi il cambio scheda e' istantaneo
  useEffect(() => {
    const t = setTimeout(() => {
      ["Agenda", "ProssimiLavori", "DaPreventivare", "DaFatturare", "InAttesa", "QuoteEditor"].forEach((n) =>
        import(`../pages/${n}`).catch(() => {}),
      );
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  const navigate = useNavigate();
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [toQuoteCount, setToQuoteCount] = useState(0);
  const [toInvoiceCount, setToInvoiceCount] = useState(0);
  const [contrattiCount, setContrattiCount] = useState(0);
  const location = useLocation();

  // Contratti di manutenzione con visita entro 15 giorni
  useEffect(() => {
    const load = () =>
      auth.currentUser &&
      api
        .get("/contratti/in-scadenza")
        .then((r) => setContrattiCount((r.data || []).length))
        .catch(() => {});
    window.__refreshContrattiBadge = load;
    const unsub = auth.onAuthStateChanged((u) => u && load());
    window.addEventListener("focus", load);
    return () => {
      unsub && unsub();
      window.removeEventListener("focus", load);
      delete window.__refreshContrattiBadge;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const cu = apiGetWithCache(`/clients/unpaid`);
      const cp = apiGetWithCache(`/clients/pending`);
      const ca = apiGetWithCache(`/clients/awaiting`);
      const cq = apiGetWithCache(`/clients/to-quote`);
      const ci = apiGetWithCache(`/clients/to-invoice`);
      if (cu.cached && !cancelled) setUnpaidCount(cu.cached.length || 0);
      if (cp.cached && !cancelled) setPendingCount(cp.cached.length || 0);
      if (ca.cached && !cancelled) setAwaitingCount(ca.cached.length || 0);
      if (cq.cached && !cancelled) setToQuoteCount(cq.cached.length || 0);
      if (ci.cached && !cancelled) setToInvoiceCount(ci.cached.length || 0);
      try {
        const [u, p, a, q, i] = await Promise.all([cu.fresh, cp.fresh, ca.fresh, cq.fresh, ci.fresh]);
        if (!cancelled) {
          setUnpaidCount((u || []).length);
          setPendingCount((p || []).length);
          setAwaitingCount((a || []).length);
          setToQuoteCount((q || []).length);
          setToInvoiceCount((i || []).length);
        }
      } catch {
        // silenzioso
      }
    };

    const unsub = auth.onAuthStateChanged((u) => {
      if (u) refresh();
    });

    const interval = setInterval(() => {
      if (auth.currentUser) refresh();
    }, 60000);
    const onFocus = () => {
      if (auth.currentUser) refresh();
    };
    window.addEventListener("focus", onFocus);
    const onDrained = () => {
      if (auth.currentUser) refresh();
    };
    window.addEventListener("agenda:queue-drained", onDrained);

    return () => {
      cancelled = true;
      unsub && unsub();
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("agenda:queue-drained", onDrained);
    };
  }, []);

  useEffect(() => {
    const mkRefresh = (endpoint, setter) => async () => {
      try {
        const data = await api.get(endpoint).then((r) => r.data);
        setter((data || []).length);
      } catch {
        // ignore
      }
    };
    window.__refreshUnpaidBadge = mkRefresh("/clients/unpaid", setUnpaidCount);
    window.__refreshPendingBadge = mkRefresh("/clients/pending", setPendingCount);
    window.__refreshAwaitingBadge = mkRefresh("/clients/awaiting", setAwaitingCount);
    window.__refreshToQuoteBadge = mkRefresh("/clients/to-quote", setToQuoteCount);
    window.__refreshToInvoiceBadge = mkRefresh("/clients/to-invoice", setToInvoiceCount);
    return () => {
      delete window.__refreshUnpaidBadge;
      delete window.__refreshPendingBadge;
      delete window.__refreshAwaitingBadge;
      delete window.__refreshToQuoteBadge;
      delete window.__refreshToInvoiceBadge;
    };
  }, []);

  const badgeFor = (key) => {
    if (key === "unpaid") return unpaidCount;
    if (key === "pending") return pendingCount;
    if (key === "awaiting") return awaitingCount;
    if (key === "to_quote") return toQuoteCount;
    if (key === "to_invoice") return toInvoiceCount;
    if (key === "contratti") return contrattiCount;
    return 0;
  };

  const current = areaOf(location.pathname);
  const [sheet, setSheet] = useState(null);
  const go = (to, state) => {
    setSheet(null);
    navigate(to, state ? { state } : undefined);
  };
  const runNew = async (a) => {
    if (!a.quote) return go(a.to, a.state);
    setSheet(null);
    try {
      navigate(`/preventivi/${(await createQuote()).id}`);
    } catch {
      toast.error("Impossibile creare il preventivo, riprova");
    }
  };
  const ufficio = AREAS.find((a) => a.key === "ufficio");

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <OfflineBanner />
      {/* Desktop: barra laterale divisa per aree */}
      <aside className="fixed left-0 top-0 hidden h-screen w-60 flex-col overflow-y-auto border-r border-stone-200/60 bg-[#F3F2F0] px-4 py-5 md:flex">
        <div className="mb-5 flex items-center gap-2 px-2">
          <img src="/app-logo.jpg" alt="Italserrande S.r.l." className="h-9 w-auto rounded-md bg-white p-0.5 shadow-sm" data-testid="app-logo" />
          <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">Agenda</span>
        </div>
        <button
          type="button"
          onClick={() => setSheet("nuovo")}
          className="mb-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0047ab] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#003a8c]"
          data-testid="side-new-button"
        >
          <Plus className="h-4 w-4" /> Nuovo
        </button>
        <button
          type="button"
          onClick={() => setSheet("ai")}
          className="-mt-3 mb-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1C1C1A] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black"
          data-testid="side-ai-button"
        >
          <Bot className="h-4 w-4" /> Assistente IA
        </button>
        <nav className="flex flex-col gap-4">
          {AREAS.map((a) => (
            <div key={a.key}>
              {a.items.length > 1 && <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">{a.label}</div>}
              <div className="flex flex-col gap-0.5">
                {a.items.map((it) => (
                  <SideItem key={it.to} {...it} badge={badgeFor(it.badgeKey)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="md:ml-60">
        <div className="mx-auto max-w-4xl px-4 pb-28 pt-4 sm:px-6 md:px-10 md:pb-10 md:pt-8">
          {/* Mobile: logo piccolo in alto */}
          <div className="mb-3 flex items-center gap-2 md:hidden no-print" data-testid="mobile-header">
            <img src="/app-logo.jpg" alt="Italserrande S.r.l." className="h-7 w-auto rounded bg-white p-0.5 shadow-sm" data-testid="mobile-logo" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Agenda</span>
            <button
              type="button"
              onClick={() => setSheet("ai")}
              aria-label="Apri l'assistente IA"
              data-testid="ai-fab"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#1C1C1A] px-3 py-1.5 text-xs font-semibold text-white shadow-sm active:scale-95"
            >
              <Bot className="h-4 w-4" /> Assistente
            </button>
          </div>
          <AreaTabs area={current} badgeFor={badgeFor} />
          {location.pathname === "/prossimi-lavori" && contrattiCount > 0 && (
            <button
              type="button"
              onClick={() => navigate("/contratti")}
              className="mb-4 flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm font-semibold text-amber-900"
              data-testid="contratti-scadenza-banner"
            >
              <BellRing className="h-4 w-4 shrink-0" />
              {contrattiCount} {contrattiCount === 1 ? "manutenzione in scadenza" : "manutenzioni in scadenza"} nei prossimi 15 giorni
            </button>
          )}
          <Outlet />
        </div>
      </main>

      <BottomSheet open={sheet === "nuovo"} onClose={() => setSheet(null)} title="Cosa vuoi creare?" testId="new-sheet">
        <div className="grid grid-cols-2 gap-2">
          {NEW_ACTIONS.map((a) => (
            <SheetTile key={a.key} icon={a.icon} label={a.label} onClick={() => runNew(a)} testId={`new-${a.key}`} />
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "ufficio"} onClose={() => setSheet(null)} title="Ufficio" testId="ufficio-sheet">
        <div className="grid grid-cols-3 gap-2">
          {ufficio.items.map((it) => (
            <SheetTile key={it.to} icon={it.icon} label={it.label} badge={badgeFor(it.badgeKey)} onClick={() => go(it.to)} testId={`menu-${it.testId}`} />
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "ai"} onClose={() => setSheet(null)} title="Assistente IA" testId="ai-sheet">
        <AssistenteChat />
      </BottomSheet>

      {/* Mobile: 4 aree + tasto Nuovo al centro */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-end border-t border-stone-200/70 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur md:hidden no-print"
      >
        {AREAS.slice(0, 2).map((a) => (
          <BarButton key={a.key} area={a} active={current?.key === a.key} badge={badgeFor(a.badgeKey)} onClick={() => go(a.to)} />
        ))}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setSheet("nuovo")}
            aria-label="Nuovo"
            data-testid="mobile-new-button"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#0047ab] text-white shadow-lg ring-4 ring-white transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" />
          </button>
        </div>
        {AREAS.slice(2).map((a) => (
          <BarButton
            key={a.key}
            area={a}
            active={current?.key === a.key}
            badge={badgeFor(a.badgeKey)}
            onClick={() => (a.key === "ufficio" ? setSheet("ufficio") : go(a.to))}
          />
        ))}
      </nav>
    </div>
  );
}
