import { useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Pulsante microfono: detta in italiano e aggiunge il testo al campo (dettatura del telefono)
export default function MicButton({ onText, testId = "mic-button" }) {
  const [on, setOn] = useState(false);
  const rec = useRef(null);
  if (!Recognition) return null;

  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    const r = new Recognition();
    r.lang = "it-IT";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim();
      if (text) onText(text);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") toast.error("Consenti l'uso del microfono nelle impostazioni del telefono");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast.error("Dettatura non disponibile, riprova");
    };
    r.onend = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-colors ${on ? "animate-pulse bg-red-600 text-white" : "bg-[#0047ab] text-white"}`}
      aria-label={on ? "Ferma dettatura" : "Detta"}
      data-testid={testId}
    >
      {on ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

export const appendText = (prev, text) => (String(prev || "").trim() ? `${String(prev).trimEnd()} ${text}` : text);
