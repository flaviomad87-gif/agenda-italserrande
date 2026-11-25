import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  Receipt,
  PieChart,
  User,
  Wallet,
  Clock,
  Hourglass,
  FileText,
  FilePlus,
  Users,
  BriefcaseBusiness,
  TrendingUp,
  Truck,
  Package,
  Menu,
  X,
  ShieldCheck,
  FileSignature,
  BellRing,
} from "lucide-react";
import { cn } from "../lib/utils";
import { api, apiGetWithCache } from "../lib/api";
import { auth } from "../lib/firebase";
import OfflineBanner from "../components/OfflineBanner";

// Voci "quotidiane" — sempre visibili nella bottom bar mobile
const primaryNav = [
  { to: "/prossimi-lavori", label: "Prossimi", icon: Clock, testId: "nav-prossimi", badgeKey: "pending" },
  { to: "/in-attesa", label: "In attesa", icon: Hourglass, testId: "nav-in-attesa", badgeKey: "awaiting" },
  { to: "/da-preventivare", label: "Preventivi", icon: FileText, testId: "nav-da-preventivare", badgeKey: "to_quote" },
  { to: "/da-fatturare", label: "Fatturare", icon: FilePlus, testId: "nav-da-fatturare", badgeKey: "to_invoice" },
  { to: "/incassi", label: "Incassi", icon: Wallet, testId: "nav-incassi", badgeKey: "unpaid" },
  { to: "/agenda", label: "Agenda", icon: Calendar, testId: "nav-agenda" },
];

// Voci secondarie — accessibili tramite hamburger menu
const secondaryNav = [
  { to: "/margine", label: "Margine", icon: TrendingUp, testId: "nav-margine" },
  { to: "/clienti", label: "Clienti", icon: Users, testId: "nav-clienti" },
  { to: "/ore-lavoro", label: "Ore Lavoro", icon: BriefcaseBusiness, testId: "nav-ore-lavoro" },
  { to: "/spese", label: "Spese", icon: Receipt, testId: "nav-spese" },
  { to: "/fornitori", label: "Fornitori", icon: Truck, testId: "nav-fornitori" },
  { to: "/magazzino", label: "Magazzino", icon: Package, testId: "nav-magazzino" },
  { to: "/rilievi", label: "Rilievi sezionali", icon: FileText, testId: "nav-rilievi" },
  { to: "/documenti", label: "Documenti CE e Manutenzione", icon: ShieldCheck, testId: "nav-documenti" },
  { to: "/contratti", label: "Contratti manutenzione", icon: FileSignature, testId: "nav-contratti", badgeKey: "contratti" },
  // Riepilogo temporaneamente nascosto su richiesta utente: calcoli non
  // ancora allineati alle sue aspettative. La pagina e le rotte restano
  // funzionanti; per riabilitarla basta ripristinare questa voce.
  // { to: "/riepilogo", label: "Riepilogo", icon: PieChart, testId: "nav-riepilogo" },
  { to: "/profilo", label: "Profilo", icon: User, testId: "nav-profilo" },
];

const NavItem = ({ to, label, icon: Icon, testId, mobile, badge, onClick }) => (
  <NavLink
    to={to}
    data-testid={testId}
    onClick={onClick}
    className={({ isActive }) =>
      cn(
        "relative flex items-center gap-3 rounded-xl transition-all",
        mobile
          ? "flex-col flex-1 min-w-0 py-2 text-[10px] font-medium"
          : "px-4 py-3 text-sm font-semibold",
        isActive
          ? mobile
            ? "text-[#4A5D23]"
            : "bg-[#EAE7DE] text-[#1C1C1A]"
          : "text-stone-500 hover:text-[#1C1C1A]",
      )
    }
  >
    {({ isActive }) => (
      <>
        <span className="relative">
          <Icon
            className={cn(
              mobile ? "h-5 w-5" : "h-5 w-5",
              isActive && mobile ? "stroke-[2.4]" : "",
            )}
          />
          {badge > 0 && (
            <span
              data-testid={`${testId}-badge`}
              className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#B8683D] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className="truncate whitespace-nowrap">{label}</span>
      </>
    )}
  </NavLink>
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  const allNav = [...primaryNav, ...secondaryNav];

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <OfflineBanner />
      {/* Desktop sidebar: tutte le voci */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-stone-200/60 bg-[#F3F2F0] p-6 md:flex">
        <div className="mb-10">
          <img src="/app-logo.jpg" alt="Italserrande S.r.l." className="w-full rounded-xl bg-white p-2 shadow-sm" data-testid="app-logo" />
          <div className="mt-2 text-center text-xs font-semibold uppercase tracking-widest text-stone-500">Agenda</div>
        </div>

        <nav className="flex flex-col gap-1">
          {allNav.map((it) => (
            <NavItem
              key={it.to}
              {...it}
              badge={badgeFor(it.badgeKey)}
            />
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="md:ml-64">
        <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-10 md:pt-10">
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

      {/* Overlay hamburger menu mobile */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:hidden no-print"
          onClick={() => setMenuOpen(false)}
          data-testid="mobile-menu-overlay"
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full rounded-t-3xl bg-white p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-lg font-bold">Altre voci</div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Chiudi menu"
                data-testid="mobile-menu-close"
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {secondaryNav.map((it) => (
                <button
                  key={it.to}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(it.to);
                  }}
                  data-testid={`menu-${it.testId}`}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-stone-700 hover:bg-stone-100"
                >
                  <it.icon className="h-5 w-5 text-stone-500" />
                  {it.label}
                  {badgeFor(it.badgeKey) > 0 && (
                    <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white" data-testid={`menu-${it.testId}-badge`}>
                      {badgeFor(it.badgeKey)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav — voci quotidiane + hamburger */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto border-t border-stone-200/70 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden no-print"
      >
        {primaryNav.map((it) => (
          <NavItem
            key={it.to}
            {...it}
            mobile
            badge={badgeFor(it.badgeKey)}
          />
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          data-testid="mobile-menu-button"
          aria-label="Apri menu"
          className="relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium text-stone-500 transition-all hover:text-[#1C1C1A]"
        >
          <Menu className="h-5 w-5" />
          {contrattiCount > 0 && <span className="absolute right-[30%] top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500" data-testid="mobile-menu-dot" />}
          <span className="truncate whitespace-nowrap">Menu</span>
        </button>
      </nav>
    </div>
  );
}
