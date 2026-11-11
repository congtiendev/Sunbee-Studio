import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** "light" and "auto" resolve `theme`; "navy"/"black" both resolve dark, differing only in `themeVariant`. */
export type ThemeMode = "light" | "navy" | "black" | "auto";
export type ThemeVariant = "navy" | "black";
type ResolvedTheme = "light" | "dark";

type ThemeContextType = {
  theme: ResolvedTheme; // Resolved theme actually active ("light" or "dark")
  themeVariant: ThemeVariant; // Which dark look is active; meaningless when theme is "light"
  themeMode: ThemeMode; // The configured preference
  setThemeMode: (mode: ThemeMode) => void;
  /** Cycles Light → Navy → Black → Light. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const CYCLE: Exclude<ThemeMode, "auto">[] = ["light", "navy", "black"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [theme, setTheme] = useState<ResolvedTheme>("light");
  const [themeVariant, setThemeVariant] = useState<ThemeVariant>("navy");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("theme-mode") as ThemeMode | null;
    const legacySavedTheme = localStorage.getItem(
      "theme",
    ) as ResolvedTheme | null;
    let initialMode: ThemeMode =
      savedMode || (legacySavedTheme as ThemeMode) || "light";
    // Pre-variant saved value: the only dark look back then is now "navy".
    if ((initialMode as string) === "dark") initialMode = "navy";

    setThemeModeState(initialMode);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    localStorage.setItem("theme-mode", themeMode);

    if (themeMode === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = () => {
        setTheme(mediaQuery.matches ? "dark" : "light");
        setThemeVariant("navy");
      };

      handleChange();

      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    } else if (themeMode === "light") {
      setTheme("light");
    } else {
      setTheme("dark");
      setThemeVariant(themeMode);
    }
  }, [themeMode, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.setAttribute("data-color-scheme", theme);
      if (theme === "dark") {
        document.documentElement.setAttribute(
          "data-theme-variant",
          themeVariant,
        );
      } else {
        document.documentElement.removeAttribute("data-theme-variant");
      }
    }
  }, [theme, themeVariant, isInitialized]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const toggleTheme = () => {
    const current =
      themeMode === "auto"
        ? theme === "dark"
          ? themeVariant
          : "light"
        : themeMode;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
    setThemeModeState(next);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, themeVariant, themeMode, setThemeMode, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
