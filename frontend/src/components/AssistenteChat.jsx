import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageSquarePlus, Send, X, Zap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import MicButton, { appendText } from "./MicButton";
import CreditoBox from "./CreditoBox";

const MODELS = [
  { key: "haiku", label: "Veloce", sub: "Haiku · meno di 1 cent a domanda", icon: Zap },
  { key: "sonnet", label: "Più bravo", sub: "Sonnet · circa 3-8 cent a domanda", icon: Sparkles },
];
const SUGGEST = ["Cosa ho in agenda questa settimana?", "Quali contratti di manutenzione sono in scadenza?", "Chi deve ancora pagarmi?"];

const errMsg = (e) => e?.response?.data?.detail || "L'assistente non ha risposto, riprova";

const Bubble = ({ m }) => (
  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "bg-[#0047ab] text-white" : "bg-stone-100 text-stone-800"}`}>
      {m.text}
    </div>
  </div>
);

const Pending = ({ actions, busy, onAnswer }) => (
  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3" data-testid="chat-pending">
    <div className="mb-2 text-sm font-bold text-amber-900">L'assistente vuole fare questa modifica:</div>
    {actions.map((a) => (
      <div key={a.id} className="mb-2 rounded-xl bg-white p-2 text-xs">
        <div className="font-semibold">{a.title}</div>
        <ul className="mt-1 space-y-0.5 text-stone-600">
          {Object.entries(a.input).map(([k, v]) => (
            <li key={k}><span className="font-semibold">{k.replace(/_/g, " ")}:</span> {Array.isArray(v) ? v.join(" · ") : String(v)}</li>
          ))}
        </ul>
      </div>
    ))}
    <div className="flex gap-2">
      <Button size="sm" onClick={() => onAnswer(true)} disabled={busy} data-testid="chat-confirm">
        <Check className="mr-1 h-4 w-4" /> Conferma
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAnswer(false)} disabled={busy} data-testid="chat-cancel">
        <X className="mr-1 h-4 w-4" /> Annulla
      </Button>
    </div>
  </div>
);

export default function AssistenteChat() {
  const [model, setModel] = useState(() => localStorage.getItem("agenda_ai_model") || "haiku");
  const [chat, setChat] = useState(null);
  const [credito, setCredito] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    api.get("/assistente/credito").then((r) => setCredito(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat, busy]);

  const pick = (k) => {
    setModel(k);
    localStorage.setItem("agenda_ai_model", k);
  };
  const apply = (data) => {
    setChat(data);
    setCredito(data.credito);
    if (data.credito?.avviso) toast.warning("Il credito dell'assistente sta per finire");
  };
  const send = async (t = text) => {
    if (!t.trim() || busy) return;
    setBusy(true);
    setChat((c) => ({ ...(c || {}), messaggi: [...(c?.messaggi || []), { role: "user", text: t }] }));
    setText("");
    try {
      apply((await api.post("/assistente/chat", { id: chat?.id, model, testo: t }, { timeout: 120000 })).data);
    } catch (e) {
      toast.error(errMsg(e));
      setChat((c) => ({ ...c, messaggi: c.messaggi.slice(0, -1) }));
      setText(t);
    } finally {
      setBusy(false);
    }
  };
  const answer = async (ok) => {
    setBusy(true);
    try {
      apply((await api.post(`/assistente/chat/${chat.id}/conferma`, { ok }, { timeout: 120000 })).data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (credito && !credito.chiave) {
    return <p className="text-sm text-stone-500" data-testid="chat-no-key">Manca la chiave Anthropic sul server: aggiungila per usare la chat.</p>;
  }
  return (
    <div className="space-y-3" data-testid="assistente-chat">
      <div className="grid grid-cols-2 gap-2" data-testid="chat-model-picker">
        {MODELS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => pick(m.key)}
            data-testid={`chat-model-${m.key}`}
            className={`rounded-xl border p-2.5 text-left transition-colors ${model === m.key ? "border-[#0047ab] bg-[#0047ab]/5" : "border-stone-200 bg-white"}`}
          >
            <div className="flex items-center gap-1.5 text-sm font-bold"><m.icon className="h-4 w-4 text-[#0047ab]" /> {m.label}</div>
            <div className="text-[11px] text-stone-500">{m.sub}</div>
          </button>
        ))}
      </div>
      {credito && <CreditoBox credito={credito} onChange={setCredito} />}

      <div className="min-h-[200px] space-y-2 rounded-2xl border border-stone-200 bg-white p-3" data-testid="chat-messages">
        {!chat?.messaggi?.length && (
          <div className="space-y-2">
            <p className="text-sm text-stone-500">Chiedi qualcosa sull'agenda. Prima di ogni modifica ti chiedo conferma.</p>
            {SUGGEST.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="block w-full rounded-xl bg-stone-50 px-3 py-2 text-left text-sm hover:bg-stone-100" data-testid="chat-suggest">
                {s}
              </button>
            ))}
          </div>
        )}
        {chat?.messaggi?.map((m, i) => <Bubble key={i} m={m} />)}
        {chat?.in_attesa && <Pending actions={chat.in_attesa} busy={busy} onAnswer={answer} />}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-stone-500" data-testid="chat-thinking">
            <Loader2 className="h-4 w-4 animate-spin" /> Sto lavorando…
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Scrivi o detta…"
            className="pr-11"
            disabled={busy || !!chat?.in_attesa}
            data-testid="chat-input"
          />
          <div className="absolute right-2 top-2">
            <MicButton onText={(t) => setText((p) => appendText(p, t))} testId="chat-mic" />
          </div>
        </div>
        <Button onClick={() => send()} disabled={busy || !text.trim() || !!chat?.in_attesa} data-testid="chat-send">
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between text-[11px] text-stone-500">
        <button type="button" onClick={() => setChat(null)} className="inline-flex items-center gap-1 font-semibold text-[#0047ab]" data-testid="chat-new">
          <MessageSquarePlus className="h-3.5 w-3.5" /> Nuova chat
        </button>
        {chat?.costo_chat > 0 && <span data-testid="chat-cost">Questa chat: circa $ {chat.costo_chat.toFixed(3)}</span>}
      </div>
    </div>
  );
}
