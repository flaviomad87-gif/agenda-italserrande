import { useState } from "react";
import { AlertTriangle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const usd = (n) => `$ ${Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Contatore del credito Anthropic: stima dal consumo di ogni risposta
export default function CreditoBox({ credito, onChange }) {
  const [edit, setEdit] = useState(!credito.impostato);
  const [ricarica, setRicarica] = useState("");
  const [soglia, setSoglia] = useState(String(credito.soglia ?? 2));
  const pct = credito.caricato > 0 ? Math.max(0, Math.min(100, (credito.residuo / credito.caricato) * 100)) : 0;

  const save = async (azzera) => {
    try {
      const { data } = await api.put("/assistente/credito", { ricarica: Number(ricarica.replace(",", ".")) || 0, soglia: Number(soglia.replace(",", ".")) || 0, azzera });
      onChange(data);
      setRicarica("");
      setEdit(false);
      toast.success("Credito aggiornato");
    } catch {
      toast.error("Controlla gli importi");
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${credito.avviso ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-stone-50"}`} data-testid="credito-box">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {credito.avviso ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Wallet className="h-4 w-4 text-[#0047ab]" />}
          {credito.impostato ? (
            <span data-testid="credito-residuo">Credito rimasto circa {usd(credito.residuo)} su {usd(credito.caricato)}</span>
          ) : (
            <span>Imposta il credito caricato su Anthropic</span>
          )}
        </div>
        <button type="button" className="text-xs font-semibold text-[#0047ab]" onClick={() => setEdit((v) => !v)} data-testid="credito-edit">
          {edit ? "Chiudi" : "Ricarica"}
        </button>
      </div>
      {credito.impostato && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
          <div className={`h-full ${credito.avviso ? "bg-amber-500" : "bg-[#0047ab]"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {credito.avviso && (
        <p className="mt-2 text-xs font-semibold text-amber-800" data-testid="credito-avviso">
          {credito.esaurito ? "Credito finito: ricarica su console.anthropic.com" : `Sta per finire: sei sotto ${usd(credito.soglia)}. Ricarica su console.anthropic.com`}
        </p>
      )}
      <p className="mt-1 text-[11px] text-stone-500">Spesi questo mese: {usd(credito.speso_mese)} · stima calcolata dall'agenda, il saldo esatto è su console.anthropic.com</p>
      {edit && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-stone-600">
            Ho ricaricato ($)
            <Input inputMode="decimal" value={ricarica} onChange={(e) => setRicarica(e.target.value)} placeholder="es. 10" data-testid="credito-ricarica" />
          </label>
          <label className="text-xs font-semibold text-stone-600">
            Avvisami sotto ($)
            <Input inputMode="decimal" value={soglia} onChange={(e) => setSoglia(e.target.value)} data-testid="credito-soglia" />
          </label>
          <Button size="sm" onClick={() => save(false)} data-testid="credito-aggiungi">Aggiungi al credito</Button>
          <Button size="sm" variant="outline" onClick={() => save(true)} data-testid="credito-azzera">Riparti da questo importo</Button>
        </div>
      )}
    </div>
  );
}
