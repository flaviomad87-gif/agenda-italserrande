import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { connectPreventivi, onPreventiviUser, prevErrorMessage } from "../lib/preventiviApp";

// undefined = in verifica, null = non collegato, oggetto = utente app Preventivi
export function usePreventiviUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onPreventiviUser((u) => setUser(u || null)), []);
  return user;
}

export function PreventiviConnectDialog({ open, onOpenChange }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!email || !password) return toast.error("Inserisci email e password");
    setBusy(true);
    try {
      await connectPreventivi(email, password);
      toast.success("App Preventivi collegata");
      setPassword("");
      onOpenChange(false);
    } catch (err) {
      toast.error(prevErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-2xl sm:max-w-md" data-testid="prev-connect-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Link2 className="h-5 w-5 text-blue-600" /> Collega app Preventivi
          </DialogTitle>
          <DialogDescription>
            Usa la stessa email e password con cui entri nell'app Preventivi. Lo fai una volta sola.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" data-testid="prev-connect-email" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" data-testid="prev-connect-password" />
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" data-testid="prev-connect-submit">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Collega
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
