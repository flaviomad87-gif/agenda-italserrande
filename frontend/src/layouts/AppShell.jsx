import { NavLink, Outlet } from "react-router-dom";
import { Calendar, Receipt, PieChart, User, Hammer } from "lucide-react";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/agenda", label: "Agenda", icon: Calendar, testId: "nav-agenda" },
  { to: "/spese", label: "Spese", icon: Receipt, testId: "nav-spese" },
  { to: "/riepilogo", label: "Riepilogo", icon: PieChart, testId: "nav-riepilogo" },
  { to: "/profilo", label: "Profilo", icon: User, testId: "nav-profilo" },
];

const NavItem = ({ to, label, icon: Icon, testId, mobile }) => (
  <NavLink
    to={to}
    data-testid={testId}
    className={({ isActive }) =>
      cn(
        "flex items-center gap-3 rounded-xl transition-all",
        mobile
          ? "flex-col flex-1 py-2 text-xs font-medium"
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
        <Icon
          className={cn(
            mobile ? "h-5 w-5" : "h-5 w-5",
            isActive && mobile ? "stroke-[2.4]" : "",
          )}
        />
        <span>{label}</span>
      </>
    )}
  </NavLink>
);

export default function AppShell() {
  return (
    <div className="min-h-screen bg-[#F9F8F6]">
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
            <NavItem key={it.to} {...it} />
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
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-stone-200/70 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden"
      >
        {navItems.map((it) => (
          <NavItem key={it.to} {...it} mobile />
        ))}
      </nav>
    </div>
  );
}
