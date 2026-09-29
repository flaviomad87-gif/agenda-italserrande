import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { Mic, MicOff, ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";

/**
 * Dialog di inserimento cliente tramite dettatura vocale, a 3 step:
 * 1) Nome  2) Indirizzo  3) Telefono
 * Usa Web Speech API (SpeechRecognition) - gratis, browser-native.
 * Al termine chiama onComplete({name, address, phone}) e il chiamante
 * apre la form ClientFormDialog pre-riempita per la preview finale.
 */

const STEPS = [
  { key: "name", label: "Nome e cognome", prompt: "Dimmi il nome e cognome", type: "text" },
  { key: "address", label: "Indirizzo", prompt: "Dimmi l'indirizzo", type: "text" },
  { key: "phone", label: "Numero di telefono", prompt: "Dimmi il numero di telefono", type: "phone" },
];

const cleanPhone = (raw) => {
  // Estrai solo cifre + eventuale prefisso +
  const digits = (raw || "").replace(/[^\d+]/g, "");
  // Normalizza doppi + iniziali
  return digits.replace(/^(\+*)/, (m) => (m ? "+" : ""));
};

const capitalize = (s) => {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
};

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function VoiceClientDialog({ open, onOpenChange, onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState({ name: "", address: "", phone: "" });
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const step = STEPS[stepIdx];

  // Reset stato all'apertura
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setValues({ name: "", address: "", phone: "" });
      setTranscript("");
    }
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, [open]);

  const supported = !!SpeechRecognitionCtor;

  const startListening = () => {
    if (!supported) {
      toast.error("Il tuo browser non supporta la dettatura vocale. Usa Chrome o Safari aggiornato.");
      return;
    }
    setTranscript("");
    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = "it-IT";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        setTranscript(text);
      };
      rec.onerror = (e) => {
        setListening(false);
        if (e.error === "not-allowed") {
          toast.error("Permesso microfono negato. Abilitalo nelle impostazioni del browser.");
        } else if (e.error !== "aborted") {
          toast.error(`Errore dettatura: ${e.error}`);
        }
      };
      rec.onend = () => setListening(false);
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (err) {
      setListening(false);
      toast.error("Impossibile avviare la dettatura vocale.");
    }
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  };

  const confirmStep = () => {
    let final = transcript.trim();
    if (!final) {
      toast.error("Nessun testo registrato. Premi il microfono e prova a rileggere.");
      return;
    }
    if (step.type === "phone") {
      final = cleanPhone(final);
    } else if (step.key === "name") {
      final = capitalize(final);
    }
    const nextValues = { ...values, [step.key]: final };
    setValues(nextValues);
    setTranscript("");
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      // Ultimo step -> completa
      onComplete(nextValues);
      onOpenChange(false);
    }
  };

  const goBack = () => {
    if (stepIdx > 0) {
      stopListening();
      setStepIdx(stepIdx - 1);
      setTranscript(values[STEPS[stepIdx - 1].key] || "");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-1.5rem)] max-w-md rounded-3xl border-stone-200/70 bg-white p-6"
        data-testid="voice-client-dialog"
      >
        <DialogHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#EAF3EF] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
            Passo {stepIdx + 1} di {STEPS.length}
          </div>
          <DialogTitle className="font-display text-2xl">{step.prompt}</DialogTitle>
        </DialogHeader>

        {!supported ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Il tuo browser non supporta la dettatura vocale. Usa Chrome recente su Android/desktop o Safari 14.5+ su iOS.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {/* Indicatore step precedenti */}
            {stepIdx > 0 && (
              <div className="rounded-2xl bg-stone-50 p-3 text-xs text-stone-500">
                {STEPS.slice(0, stepIdx).map((s) => (
                  <div key={s.key} className="flex justify-between gap-2">
                    <span className="font-semibold uppercase tracking-widest text-stone-400">{s.label}</span>
                    <span className="truncate font-semibold text-stone-700">{values[s.key] || "—"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Area trascrizione */}
            <div
              data-testid="voice-transcript-area"
              className={`min-h-[6rem] rounded-2xl border-2 p-4 text-center transition ${
                listening ? "border-[#4A5D23] bg-[#EAF3EF]/40" : "border-stone-200 bg-stone-50/50"
              }`}
            >
              {listening && (
                <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#2E5A47]"></span>
                  In ascolto…
                </div>
              )}
              <div className={`font-display text-lg font-semibold ${transcript ? "text-stone-900" : "text-stone-400"}`}>
                {transcript || (listening ? "Parla ora…" : "Schiaccia il microfono e detta.")}
              </div>
            </div>

            {/* Pulsante microfono grande */}
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              data-testid="voice-mic-button"
              className={`flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-base font-semibold text-white shadow-sm transition active:scale-95 ${
                listening ? "bg-red-600 hover:bg-red-700" : "bg-[#4A5D23] hover:bg-[#3C4B1C]"
              }`}
            >
              {listening ? <><MicOff className="h-5 w-5" /> Ferma</> : <><Mic className="h-5 w-5" /> Parla</>}
            </button>

            {/* Editabile prima della conferma (se non ti soddisfa la trascrizione) */}
            <input
              type={step.type === "phone" ? "tel" : "text"}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={`Oppure scrivi il ${step.label.toLowerCase()}`}
              data-testid="voice-text-input"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 placeholder:text-stone-400"
            />

            {/* Nav */}
            <div className="flex items-center gap-2">
              {stepIdx > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  data-testid="voice-back-button"
                  className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Indietro
                </button>
              )}
              <button
                type="button"
                onClick={confirmStep}
                disabled={!transcript.trim()}
                data-testid="voice-next-button"
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-40"
              >
                {stepIdx < STEPS.length - 1 ? (
                  <>Avanti <ArrowRight className="h-4 w-4" /></>
                ) : (
                  <><Check className="h-4 w-4" /> Fine</>
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
