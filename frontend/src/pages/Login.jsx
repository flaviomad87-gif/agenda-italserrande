import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Hammer, Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      toast.success("Accesso effettuato");
      navigate("/agenda", { replace: true });
    } catch (err) {
      toast.error("Email o password non validi");
    } finally {
      setSubmitting(false);
    }
  };

  const onForgot = async () => {
    if (!email) {
      toast.info("Inserisci la tua email per recuperare la password");
      return;
    }
    try {
      await resetPassword(email.trim());
      toast.success("Email di recupero inviata");
    } catch {
      toast.error("Impossibile inviare l'email di recupero");
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
            <h1 className="font-display text-3xl font-bold tracking-tight">Agenda Italserrande</h1>
            <p className="mt-1 text-sm text-stone-500">Accedi al tuo spazio di lavoro</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                placeholder="nome@azienda.it"
                className="mt-2 h-12 rounded-xl"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password-input"
                  placeholder="••••••••"
                  className="mt-2 h-12 rounded-xl pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  data-testid="login-toggle-password"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  className="absolute right-2 top-1/2 mt-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-[#4A5D23] text-white hover:bg-[#3C4B1C] active:scale-[0.99]"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accedi"}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={onForgot}
                data-testid="login-forgot-password"
                className="text-stone-500 hover:text-[#4A5D23]"
              >
                Password dimenticata?
              </button>
              <Link
                to="/register"
                data-testid="login-go-register"
                className="font-semibold text-[#4A5D23] hover:underline"
              >
                Crea account
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
