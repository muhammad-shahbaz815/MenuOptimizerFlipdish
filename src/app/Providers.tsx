'use client';

import FlipdishUIProvider from '@flipdish/portal-library/providers/FlipdishUIProvider';
import { SessionProvider } from 'next-auth/react';
import EmotionRegistry from './EmotionRegistry';
import { ThemeProvider, useTheme } from './ThemeProvider';

function FlipdishWithTheme({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <FlipdishUIProvider languageOverride="en" themeModeOverride={theme}>
      {children}
    </FlipdishUIProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <EmotionRegistry>
        <FlipdishWithTheme>
          <SessionProvider>{children}</SessionProvider>
        </FlipdishWithTheme>
      </EmotionRegistry>
    </ThemeProvider>
  );
}
