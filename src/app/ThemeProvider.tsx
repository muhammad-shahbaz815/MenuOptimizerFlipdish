'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

const THEME_KEY = 'theme';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = readTheme();
    setThemeState(t);
    applyTheme(t);
    setMounted(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  if (!mounted) return <>{children}</>;

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: 'light' as Theme, setTheme: () => {} };
  return ctx;
}
