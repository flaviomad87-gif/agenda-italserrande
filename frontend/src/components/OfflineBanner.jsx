import { useEffect, useState } from "react";
import { WifiOff, RotateCw, CheckCircle2 } from "lucide-react";
import { onQueueChange, queueCount } from "../lib/offlineQueue";

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState(queueCount());
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsub = onQueueChange(setPending);
    const onDrained = (e) => {
      if (e?.detail?.processed > 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    };
    window.addEventListener("agenda:queue-drained", onDrained);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("agenda:queue-drained", onDrained);
      unsub && unsub();
    };
  }, []);

  if (online && pending === 0 && !justSynced) return null;

  let cls = "";
  let Icon = WifiOff;
  let label = "";
  let testId = "offline-banner";

  if (!online) {
    cls = "bg-[#FBF1DE] text-[#7A4F0A] border-b border-[#D89A2C]/30";
    Icon = WifiOff;
    label = pending > 0
      ? `Offline · ${pending} ${pending === 1 ? "modifica" : "modifiche"} verranno sincronizzate al ritorno della rete`
      : "Offline · stai vedendo i dati salvati sul telefono";
  } else if (pending > 0) {
    cls = "bg-[#E8F0F4] text-[#335C6E] border-b border-[#335C6E]/20";
    Icon = RotateCw;
    label = `Sincronizzazione in corso · ${pending} ${pending === 1 ? "modifica" : "modifiche"} in coda`;
    testId = "syncing-banner";
  } else if (justSynced) {
    cls = "bg-[#EAF3EF] text-[#234737] border-b border-[#2E5A47]/20";
    Icon = CheckCircle2;
    label = "Tutto sincronizzato";
    testId = "synced-banner";
  }

  return (
    <div
      data-testid={testId}
      className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold ${cls}`}
    >
      <Icon className={`h-3.5 w-3.5 ${pending > 0 && online ? "animate-spin" : ""}`} />
      <span>{label}</span>
    </div>
  );
}
