import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Calendar, Receipt, PieChart, User, Hammer, Wallet, Clock, Hourglass } from "lucide-react";
import { cn } from "../lib/utils";
import { api, apiGetWithCache } from "../lib/api";
import { auth } from "../lib/firebase";
import OfflineBanner from "../components/OfflineBanner";

const navItems = [
  { to: "/prossimi-lavori", label: "Prossimi", icon: Clock, testId: "nav-prossimi", badgeKey: "pending" },
  { to: "/in-attesa", label: "In attesa", icon: Hourglass, testId: "nav-in-attesa", badgeKey: "awaiting" },
  { to: "/incassi", label: "Incassi", icon: Wallet, testId: "nav-incassi", badgeKey: "unpaid" },
  { to: "/agenda", label: "Agenda", icon: Calendar, testId: "nav-agenda" },
  { to: "/spese", label: "Spese", icon: Receipt, testId: "nav-spese" },
  { to: "/riepilogo", label: "Riepilogo", icon: PieChart, testId: "nav-riepilogo" },
  { to: "/profilo", label: "Profilo", icon: User, testId: "nav-profilo" },
];

const NavItem = ({ to, label, icon: Icon, testId, mobile, badge }) => (
  <NavLink
    to={to}
    data-testid={testId}
    className={({ isActive }) =>
      cn(
        "relative flex items-center gap-3 rounded-xl transition-all",
        mobile
          ? "flex-col flex-1 py-2 text-[11px] font-medium"
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
        <span className="whitespace-nowrap">{label}</span>
      </>
    )}
  </NavLink>
);

export default function AppShell() {
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [awaitingCount, setAwaitingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      // Cache-first per badge istantaneo
      const cu = apiGetWithCache(`/clients/unpaid`);
      const cp = apiGetWithCache(`/clients/pending`);
      const ca = apiGetWithCache(`/clients/awaiting`);
      if (cu.cached && !cancelled) setUnpaidCount(cu.cached.length || 0);
      if (cp.cached && !cancelled) setPendingCount(cp.cached.length || 0);
      if (ca.cached && !cancelled) setAwaitingCount(ca.cached.length || 0);
      try {
        const [u, p, a] = await Promise.all([cu.fresh, cp.fresh, ca.fresh]);
        if (!cancelled) {
          setUnpaidCount((u || []).length);
          setPendingCount((p || []).length);
          setAwaitingCount((a || []).length);
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

  // Refresh manuali per dialog/quick actions
  useEffect(() => {
    window.__refreshUnpaidBadge = async () => {
      try {
        const data = await api.get("/clients/unpaid").then((r) => r.data);
        setUnpaidCount((data || []).length);
      } catch {
        // ignore
      }
    };
    window.__refreshPendingBadge = async () => {
      try {
        const data = await api.get("/clients/pending").then((r) => r.data);
        setPendingCount((data || []).length);
      } catch {
        // ignore
      }
    };
    window.__refreshAwaitingBadge = async () => {
      try {
        const data = await api.get("/clients/awaiting").then((r) => r.data);
        setAwaitingCount((data || []).length);
      } catch {
        // ignore
      }
    };
    return () => {
      delete window.__refreshUnpaidBadge;
      delete window.__refreshPendingBadge;
      delete window.__refreshAwaitingBadge;
    };
  }, []);

  const badgeFor = (key) => {
    if (key === "unpaid") return unpaidCount;
    if (key === "pending") return pendingCount;
    if (key === "awaiting") return awaitingCount;
    return 0;
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <OfflineBanner />
      {/* Desktop sidebar */}
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
          {navItems.map((it) => (
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

      {/* Mobile bottom nav */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-stone-200/70 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden"
      >
        {navItems.map((it) => (
          <NavItem
            key={it.to}
            {...it}
            mobile
            badge={badgeFor(it.badgeKey)}
          />
        ))}
      </nav>
    </div>
  );
}
