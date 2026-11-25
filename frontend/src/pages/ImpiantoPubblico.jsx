import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Phone, Mail, CalendarCheck, Loader2, Wrench } from "lucide-react";
import { TIPI_CHIUSURA } from "../lib/praticaTesti";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "-");

// Scheda pubblica dell'impianto aperta dal QR della targhetta CE (senza login)
export default function ImpiantoPubblico() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    axios
      .get(`${API}/public/impianto/${token}`)
      .then((r) => setData(r.data))
      .catch(() => setErr(true));
  }, [token]);

  const rows = data && [
    ["Tipo", TIPI_CHIUSURA[data.tipo_chiusura] || "Chiusura motorizzata"],
    ["Modello", data.modello],
    ["Matricola", data.matricola],
    ["Installazione", data.data_installazione ? fmt(data.data_installazione) : data.anno_installazione],
    ["Comune", data.comune],
  ].filter(([, v]) => v);

  return (
    <div className="min-h-screen bg-[#f7f9fc] px-4 py-8" data-testid="impianto-public-page">
      <div className="mx-auto max-w-md space-y-4">
        <img src="/app-logo.jpg" alt="Italserrande S.r.l." className="mx-auto w-56 rounded-2xl bg-white p-3 shadow-sm" />
        {err ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-600" data-testid="impianto-not-found">Impianto non trovato.</p>
        ) : !data ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
        ) : (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#0047ab]">
                <Wrench className="h-4 w-4" /> Scheda impianto
              </div>
              <dl className="space-y-2 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-stone-100 pb-2">
                    <dt className="text-stone-500">{k}</dt>
                    <dd className="text-right font-semibold text-stone-900" data-testid={`impianto-${k.toLowerCase()}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#0047ab]">
                <CalendarCheck className="h-4 w-4" /> Manutenzione
              </div>
              <div className="flex justify-between text-sm"><span className="text-stone-500">Ultima</span><b data-testid="impianto-ultima">{fmt(data.ultima_manutenzione)}</b></div>
              <div className="mt-2 flex justify-between text-sm"><span className="text-stone-500">Prossima</span><b data-testid="impianto-prossima">{fmt(data.prossima_manutenzione)}</b></div>
              <p className="mt-3 text-xs text-stone-500">La manutenzione periodica mantiene l'impianto sicuro e valida la Dichiarazione di conformità.</p>
            </section>
            <section className="space-y-2">
              <a href="tel:+39337743730" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0047ab] font-semibold text-white" data-testid="impianto-call">
                <Phone className="h-4 w-4" /> Chiama assistenza 337 743730
              </a>
              <a href="tel:+39066240259" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#0047ab] bg-white font-semibold text-[#0047ab]" data-testid="impianto-call-office">
                <Phone className="h-4 w-4" /> Ufficio 06 6240259
              </a>
              <a href="mailto:italserrande@libero.it" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white font-semibold text-stone-700" data-testid="impianto-mail">
                <Mail className="h-4 w-4" /> italserrande@libero.it
              </a>
            </section>
            <p className="text-center text-xs text-stone-400">Italserrande S.r.l. · Via Castino 29, 00166 Roma</p>
          </>
        )}
      </div>
    </div>
  );
}
