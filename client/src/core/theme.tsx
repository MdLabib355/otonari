import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: ThemePreference;
  effectiveTheme: EffectiveTheme;
  isDark: boolean;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'otonari-theme';

export function getSavedTheme(): ThemePreference {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light' || val === 'dark' || val === 'system') return val;
  } catch {
    // ignore
  }
  return 'system';
}

export function saveTheme(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(getSavedTheme);
  const [systemDark, setSystemDark] = useState<boolean>(getSystemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const isDark = theme === 'system' ? systemDark : theme === 'dark';
  const effectiveTheme: EffectiveTheme = isDark ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#12161c' : '#1f4b6e');
    }
  }, [isDark]);

  function setTheme(next: ThemePreference) {
    saveTheme(next);
    setThemeState(next);
  }

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, isDark, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
