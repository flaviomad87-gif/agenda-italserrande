import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Calendar,
  Receipt,
  PieChart,
  User,
  Hammer,
  Wallet,
  Clock,
  Hourglass,
  FileText,
  FilePlus,
  Menu,
  X,
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
  { to: "/spese", label: "Spese", icon: Receipt, testId: "nav-spese" },
  { to: "/riepilogo", label: "Riepilogo", icon: PieChart, testId: "nav-riepilogo" },
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
  const navigate = useNavigate();
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [toQuoteCount, setToQuoteCount] = useState(0);
  const [toInvoiceCount, setToInvoiceCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

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
    return 0;
  };

  const allNav = [...primaryNav, ...secondaryNav];

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <OfflineBanner />
      {/* Desktop sidebar: tutte le voci */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-stone-200/60 bg-[#F3F2F0] p-6 md:flex">
        <div className="mb-10 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A5D23] text-white">
            <Hammer className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-none">Agenda</div>
            <div className="text-xs text-stone-500">Italserrande</div>
          </div>
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
          <span className="truncate whitespace-nowrap">Menu</span>
        </button>
      </nav>
    </div>
  );
}
