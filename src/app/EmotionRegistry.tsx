'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

const cache = createCache({ key: 'app', prepend: true });

export default function EmotionRegistry({ children }: { children: React.ReactNode }) {
  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
