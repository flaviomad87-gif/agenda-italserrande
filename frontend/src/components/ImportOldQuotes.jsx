import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { getDoc, doc, getFirestore } from "firebase/firestore";
import { getApps } from "firebase/app";
import { api } from "../lib/api";
import { listQuotes, prevErrorMessage } from "../lib/preventiviApp";
import { PreventiviConnectDialog, usePreventiviUser } from "./PreventiviConnect";

// Importa tutti i preventivi e i dati azienda dalla vecchia app Preventivi.
// Se la vecchia app e' gia' collegata su questo telefono parte da sola, una volta.
export default function ImportOld({ onDone, prominent }) {
  const user = usePreventiviUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (silent) => {
    setBusy(true);
    try {
      const old = await listQuotes();
      const app = getApps().find((a) => a.name === "preventivi");
      const s = (await getDoc(doc(getFirestore(app), "users", user.uid, "meta", "settings"))).data() || {};
      const quotes = old.map(({ id, ...q }) => ({ ...q, source_id: id }));
      const res = await api.post("/quotes/import", { quotes, company: s.company || null, counter: s.counter || 0 });
      localStorage.setItem("quotes_imported_v1", "1");
      if (!silent || res.data.imported) toast.success(`Importati ${res.data.imported} preventivi dalla vecchia app`);
      onDone();
    } catch (err) {
      if (!silent) toast.error(err?.response ? "Errore nell'importazione" : prevErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [onDone, user]);

  useEffect(() => {
    if (user && !localStorage.getItem("quotes_imported_v1")) run(true);
  }, [user, run]);

  const click = () => (user ? run(false) : setOpen(true));
  const dialog = (
    <PreventiviConnectDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
      }}
    />
  );
  if (prominent)
    return (
      <div className="space-y-2 rounded-2xl border-2 border-dashed border-blue-300 bg-white p-4 text-center" data-testid="prev-import-card">
        <p className="text-sm font-semibold text-stone-800">Porta qui i preventivi della vecchia app</p>
        <p className="text-xs text-stone-500">Una volta sola: entri con email e password della vecchia app Preventivi e l'agenda copia tutto da sola (numeri, clienti, dati azienda).</p>
        <button type="button" onClick={click} disabled={busy} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white disabled:opacity-60" data-testid="prev-import-button">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {busy ? "Importazione in corso…" : "Importa preventivi"}
        </button>
        {dialog}
      </div>
    );
  return (
    <div className="flex justify-end">
      <button type="button" onClick={click} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline-offset-2 hover:underline" data-testid="prev-import-button">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Importa dalla vecchia app Preventivi
      </button>
      {dialog}
    </div>
  );
}
