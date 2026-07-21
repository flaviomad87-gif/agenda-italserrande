import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { formatEUR } from "../lib/utils";
import { TrendingUp, TrendingDown, Wallet, CreditCard, Landmark, Package, HardHat, Receipt, FileText } from "lucide-react";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const PAY_META = {
  contanti: { label: "Contanti", icon: Wallet, bg: "bg-[#EAF3EF]", text: "text-[#2E5A47]" },
  pos: { label: "POS / Carta", icon: CreditCard, bg: "bg-[#E8F0F4]", text: "text-[#335C6E]" },
  bonifico: { label: "Bonifico", icon: Landmark, bg: "bg-[#F0EBF1]", text: "text-[#6B5B72]" },
};

/**
 * Dialog che mostra i dettagli di un singolo mese dalla vista annuale.
 * Riceve i dati già calcolati dal backend (nessuna chiamata aggiuntiva).
 */
export default function MonthDetailsDialog({ open, onOpenChange, month }) {
  if (!month) return null;
  const [year, mm] = month.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(mm, 10) - 1]} ${year}`;
  const isProfit = (month.balance || 0) >= 0;
  const isEmpty = month.counts.clients === 0 && month.counts.expenses === 0 && month.counts.advances === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-2xl"
        data-testid="month-details-dialog"
      >
        <DialogHeader>
          <div className={`mb-2 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
            isEmpty
              ? "bg-stone-100 text-stone-500"
              : isProfit
                ? "bg-[#EAF3EF] text-[#2E5A47]"
                : "bg-red-50 text-red-600"
          }`}>
            <Receipt className="h-3.5 w-3.5" /> Dettaglio mese
          </div>
          <DialogTitle className="font-display text-2xl">{monthLabel}</DialogTitle>
        </DialogHeader>

        {isEmpty ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
            Nessuna attività registrata in questo mese.
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Risultato del mese */}
            <div className={`rounded-2xl border p-5 shadow-sm ${
              isProfit ? "border-[#2E5A47]/20 bg-gradient-to-br from-[#EAF3EF] to-white"
                       : "border-red-200 bg-gradient-to-br from-red-50 to-white"
            }`}>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                {isProfit ? "Guadagno del mese" : "Perdita del mese"}
              </div>
              <div className={`mt-1 font-display text-3xl font-bold tabular-nums ${
                isProfit ? "text-[#2E5A47]" : "text-red-600"
              }`} data-testid="month-details-balance">
                {isProfit ? "+ " : "− "}{formatEUR(Math.abs(month.balance || 0))}
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Formula: Imponibile − Spese fisse − Materiali
              </div>
            </div>

            {/* Griglia principale */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-stone-200/60 bg-white p-3">
                <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[#2E5A47]">
                  <TrendingUp className="h-3 w-3" /> Imponibile
                </div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums">
                  {formatEUR(month.total_imponibile || 0)}
                </div>
                {(month.total_iva || 0) > 0 && (
                  <div className="mt-0.5 text-[10px] text-stone-400">
                    IVA: {formatEUR(month.total_iva)}
                  </div>
                )}
                {(month.total_ritenuta || 0) > 0 && (
                  <div className="text-[10px] text-stone-400">
                    Ritenuta: {formatEUR(month.total_ritenuta)}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-stone-200/60 bg-white p-3">
                <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-red-600">
                  <TrendingDown className="h-3 w-3" /> Spese fisse
                </div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums">
                  {formatEUR(month.total_spese || 0)}
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200/60 bg-white p-3">
                <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-stone-600">
                  <Package className="h-3 w-3" /> Materiali
                </div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums">
                  {formatEUR(month.total_materials || 0)}
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200/60 bg-white p-3">
                <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                  <HardHat className="h-3 w-3" /> Acconti
                </div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums text-stone-500">
                  {formatEUR(month.total_advances || 0)}
                </div>
                <div className="mt-0.5 text-[10px] text-stone-400">promemoria</div>
              </div>
            </div>

            {/* Incassi per metodo */}
            {month.total_incassi > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                  Incassi per metodo
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {["contanti", "pos", "bonifico"].map((k) => {
                    const meta = PAY_META[k];
                    const Icon = meta.icon;
                    const gross = month.incassi_by_method?.[k] || 0;
                    if (gross <= 0) return null;
                    const net = month.incassi_net_by_method?.[k] || 0;
                    return (
                      <div key={k} className={`rounded-2xl p-3 ${meta.bg}`}>
                        <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest ${meta.text}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </div>
                        <div className="mt-1 font-display text-lg font-bold tabular-nums">
                          {formatEUR(gross)}
                        </div>
                        {net > 0 && net !== gross && (
                          <div className="mt-0.5 text-[10px] text-stone-500">
                            Netto IVA: {formatEUR(net)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preventivi ancora aperti */}
            {(month.total_quotes || 0) > 0 && (
              <div className="rounded-2xl border border-[#B8683D]/20 bg-[#FBF1DE]/40 p-3">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#B8683D]">
                  <FileText className="h-3 w-3" /> Preventivi aperti
                </div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums text-[#B8683D]">
                  {formatEUR(month.total_quotes)}
                </div>
                <div className="mt-0.5 text-[10px] text-stone-500">
                  Non inclusi nel guadagno (non ancora eseguiti)
                </div>
              </div>
            )}

            {/* Conteggi */}
            <div className="rounded-2xl bg-stone-50 p-3 text-xs text-stone-600">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="font-display text-lg font-bold text-stone-800">{month.counts.clients}</div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">
                    {month.counts.clients === 1 ? "lavoro" : "lavori"}
                  </div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-stone-800">{month.counts.expenses}</div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">
                    {month.counts.expenses === 1 ? "spesa" : "spese"}
                  </div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-stone-800">{month.counts.advances}</div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">
                    {month.counts.advances === 1 ? "acconto" : "acconti"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
