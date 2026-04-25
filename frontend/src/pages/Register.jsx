import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Hammer, Loader2 } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La password deve essere di almeno 6 caratteri");
      return;
    }
    setSubmitting(true);
    try {
      await register(email.trim(), password);
      toast.success("Account creato");
      navigate("/agenda", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use")
        toast.error("Questa email è già registrata");
      else if (code === "auth/invalid-email") toast.error("Email non valida");
      else toast.error("Impossibile creare l'account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F9F8F6] px-4 py-10">
      <div className="w-full max-w-md fade-in">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A5D23] text-white shadow-sm">
            <Hammer className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight">Crea il tuo account</h1>
            <p className="mt-1 text-sm text-stone-500">Inizia a organizzare la tua agenda</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-5">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="register-email-input"
                placeholder="nome@azienda.it"
                className="mt-2 h-12 rounded-xl"
                autoComplete="email"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Password</Label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="register-password-input"
                placeholder="Almeno 6 caratteri"
                className="mt-2 h-12 rounded-xl"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              data-testid="register-submit-button"
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-[#4A5D23] text-white hover:bg-[#3C4B1C]"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea account"}
            </Button>

            <p className="text-center text-sm text-stone-500">
              Hai già un account?{" "}
              <Link to="/login" data-testid="register-go-login" className="font-semibold text-[#4A5D23] hover:underline">
                Accedi
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
