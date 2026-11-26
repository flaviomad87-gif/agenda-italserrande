import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

// Schede delle pagine dell'area corrente (pagine separate, si passa con un tocco)
export default function AreaTabs({ area, badgeFor }) {
  if (!area || area.items.length < 2) return null;
  return (
    <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 no-print sm:mx-0 sm:px-0" data-testid={`area-tabs-${area.key}`}>
      {area.items.map((it) => {
        const badge = badgeFor(it.badgeKey);
        return (
          <NavLink
            key={it.to}
            to={it.to}
            data-testid={`tab-${it.testId}`}
            className={({ isActive }) =>
              cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive ? "border-[#0047ab] bg-[#0047ab] text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300",
              )
            }
          >
            {({ isActive }) => (
              <>
                <it.icon className="h-3.5 w-3.5" />
                {it.label}
                {badge > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[10px] font-bold", isActive ? "bg-white/25 text-white" : "bg-amber-500 text-white")}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
