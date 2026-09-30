import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Pulsante microfono riutilizzabile per la ricerca vocale.
 * Usa Web Speech API nativa (it-IT). Non richiede chiavi né rete.
 *
 * Props:
 *   - onResult(text: string): callback quando l'utente finisce di parlare.
 *   - onInterim?(text: string): callback per il testo parziale (facoltativo).
 *   - className?: string
 *   - testId?: string (default "voice-search-button")
 */
export default function VoiceSearchButton({
  onResult,
  onInterim,
  className = "",
  testId = "voice-search-button",
}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supported = !!SpeechRecognitionCtor;

  // Ripulisci in caso di unmount durante l'ascolto.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  const startListening = () => {
    if (!supported) {
      toast.error(
        "Il tuo browser non supporta la dettatura vocale. Usa Chrome o Safari aggiornato.",
      );
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = "it-IT";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let finalText = "";

      rec.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (interim) onInterim?.(interim.trim());
        if (final) finalText += final;
      };
      rec.onerror = (e) => {
        setListening(false);
        if (e.error === "not-allowed") {
          toast.error(
            "Permesso microfono negato. Abilitalo nelle impostazioni del browser.",
          );
        } else if (e.error === "no-speech") {
          toast.info("Non ho sentito nulla. Riprova.");
        } else if (e.error !== "aborted") {
          toast.error(`Errore dettatura: ${e.error}`);
        }
      };
      rec.onend = () => {
        setListening(false);
        const text = finalText.trim();
        if (text) onResult?.(text);
      };

      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
      toast.error("Impossibile avviare la dettatura vocale.");
    }
  };

  if (!supported) return null; // non mostrare il pulsante se non supportato

  return (
    <button
      type="button"
      onClick={startListening}
      data-testid={testId}
      aria-label={listening ? "Ferma dettatura" : "Cerca con la voce"}
      title={listening ? "Ferma dettatura" : "Cerca con la voce"}
      className={
        "inline-flex flex-none items-center justify-center rounded-xl transition " +
        (listening
          ? "animate-pulse bg-[#B8683D] text-white shadow-md hover:bg-[#9F5630]"
          : "border border-stone-300 bg-white text-stone-600 shadow-sm hover:bg-stone-50 hover:text-[#4A5D23]") +
        " " +
        className
      }
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
