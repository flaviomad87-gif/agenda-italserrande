import { X } from "lucide-react";

// Pannello che sale dal basso (mobile) per menu e scelte rapide
export default function BottomSheet({ open, onClose, title, testId, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center no-print" onClick={onClose} data-testid={`${testId}-overlay`}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-xl md:max-w-md md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-lg font-bold">{title}</div>
          <button type="button" onClick={onClose} aria-label="Chiudi" data-testid={`${testId}-close`} className="rounded-full p-2 text-stone-500 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Riquadro con icona per le griglie dei pannelli
export const SheetTile = ({ icon: Icon, label, badge, onClick, testId }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-2 py-4 text-center text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 active:scale-[0.98]"
  >
    <Icon className="h-6 w-6 text-[#0047ab]" />
    {label}
    {badge > 0 && (
      <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" data-testid={`${testId}-badge`}>
        {badge}
      </span>
    )}
  </button>
);
