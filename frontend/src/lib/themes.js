/**
 * Temi disponibili — ogni tema sovrascrive i colori principali dell'app
 * tramite CSS variables + regole di override sui colori hex hardcoded.
 *
 * Aggiungere un nuovo tema:
 *  1. Aggiungerlo qui con id, label, description, isDark
 *  2. Aggiungere le regole CSS in index.css sotto [data-theme="<id>"]
 */

export const THEMES = [
  {
    id: "verde-classico",
    label: "Verde Classico",
    description: "Elegante e professionale (predefinito)",
    isDark: false,
    swatch: ["#4A5D23", "#F9F8F6", "#B8683D"],
  },
  {
    id: "notte-verde",
    label: "Notte Verde",
    description: "Sfondo scuro, accenti verdi",
    isDark: true,
    swatch: ["#8FB03F", "#141915", "#D6875C"],
  },
  {
    id: "moderno",
    label: "Moderno",
    description: "Bianco/nero con accenti arancioni",
    isDark: false,
    swatch: ["#111827", "#FFFFFF", "#F97316"],
  },
  {
    id: "notte-blu",
    label: "Notte Blu",
    description: "Blu scuro, accenti azzurri",
    isDark: true,
    swatch: ["#60A5FA", "#0F172A", "#F59E0B"],
  },
  {
    id: "cantiere",
    label: "Cantiere",
    description: "Giallo caschetto, nero, industriale",
    isDark: false,
    swatch: ["#111111", "#FEF9E7", "#F5C518"],
  },
  {
    id: "vintage",
    label: "Vintage",
    description: "Beige e marroni caldi, stile carta",
    isDark: false,
    swatch: ["#7C4A2E", "#F5EFE3", "#C08552"],
  },
];

export const DEFAULT_THEME = "verde-classico";
const STORAGE_KEY = "agenda_theme";

/** Applica un tema al document.documentElement */
export function applyTheme(themeId) {
  const valid = THEMES.find((t) => t.id === themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", valid);
  const isDark = THEMES.find((t) => t.id === valid)?.isDark;
  document.documentElement.classList.toggle("theme-dark", !!isDark);
  try {
    localStorage.setItem(STORAGE_KEY, valid);
  } catch {
    /* private mode */
  }
}

/** Legge il tema salvato o restituisce il default */
export function getSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Da chiamare al primo mount dell'app */
export function initTheme() {
  applyTheme(getSavedTheme());
}
