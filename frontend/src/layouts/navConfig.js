import {
  Calendar,
  Receipt,
  User,
  Wallet,
  Clock,
  Hourglass,
  FileText,
  FilePlus,
  Users,
  BriefcaseBusiness,
  TrendingUp,
  Truck,
  Package,
  ShieldCheck,
  FileSignature,
  Briefcase,
  Euro,
  Building2,
  Ruler,
  FolderCheck,
  UserPlus,
  Bot,
} from "lucide-react";

// Le 4 aree dell'agenda: ogni pagina appartiene a una sola area
export const AREAS = [
  {
    key: "agenda",
    label: "Agenda",
    icon: Calendar,
    to: "/agenda",
    items: [{ to: "/agenda", label: "Agenda", icon: Calendar, testId: "nav-agenda" }],
  },
  {
    key: "lavori",
    label: "Lavori",
    icon: Briefcase,
    to: "/prossimi-lavori",
    badgeKey: "pending",
    items: [
      { to: "/prossimi-lavori", label: "Prossimi", icon: Clock, testId: "nav-prossimi", badgeKey: "pending" },
      { to: "/in-attesa", label: "In attesa", icon: Hourglass, testId: "nav-in-attesa", badgeKey: "awaiting" },
      { to: "/da-preventivare", label: "Preventivi", icon: FileText, testId: "nav-da-preventivare", badgeKey: "to_quote" },
      { to: "/da-fatturare", label: "Da fatturare", icon: FilePlus, testId: "nav-da-fatturare", badgeKey: "to_invoice" },
    ],
    extra: ["/preventivi/"],
  },
  {
    key: "soldi",
    label: "Soldi",
    icon: Euro,
    to: "/incassi",
    badgeKey: "unpaid",
    items: [
      { to: "/incassi", label: "Incassi", icon: Wallet, testId: "nav-incassi", badgeKey: "unpaid" },
      { to: "/margine", label: "Margine", icon: TrendingUp, testId: "nav-margine" },
      { to: "/spese", label: "Spese", icon: Receipt, testId: "nav-spese" },
      { to: "/fornitori", label: "Fornitori", icon: Truck, testId: "nav-fornitori" },
    ],
    extra: ["/archivio/", "/riepilogo"],
  },
  {
    key: "ufficio",
    label: "Ufficio",
    icon: Building2,
    badgeKey: "contratti",
    items: [
      { to: "/clienti", label: "Clienti", icon: Users, testId: "nav-clienti" },
      { to: "/rilievi", label: "Rilievi", icon: Ruler, testId: "nav-rilievi" },
      { to: "/documenti", label: "Documenti CE", icon: ShieldCheck, testId: "nav-documenti" },
      { to: "/contratti", label: "Contratti", icon: FileSignature, testId: "nav-contratti", badgeKey: "contratti" },
      { to: "/magazzino", label: "Magazzino", icon: Package, testId: "nav-magazzino" },
      { to: "/ore-lavoro", label: "Ore lavoro", icon: BriefcaseBusiness, testId: "nav-ore-lavoro" },
      { to: "/assistente", label: "Assistente IA", icon: Bot, testId: "nav-assistente" },
      { to: "/profilo", label: "Profilo", icon: User, testId: "nav-profilo" },
    ],
  },
];

export const areaOf = (path) =>
  AREAS.find((a) => a.items.some((it) => it.to === path) || (a.extra || []).some((p) => path.startsWith(p)));

// Voci del tasto "+": dove andare e cosa aprire
export const NEW_ACTIONS = [
  { key: "lavoro", label: "Nuovo lavoro", icon: UserPlus, to: "/prossimi-lavori", state: { prefill: {} } },
  { key: "preventivo", label: "Nuovo preventivo", icon: FileText, quote: true },
  { key: "rilievo", label: "Nuovo rilievo", icon: Ruler, to: "/rilievi", state: { nuovo: true } },
  { key: "pratica", label: "Nuova pratica impianto", icon: FolderCheck, to: "/documenti?nuova=pratica" },
  { key: "contratto", label: "Nuovo contratto", icon: FileSignature, to: "/contratti", state: { nuovo: true } },
];
