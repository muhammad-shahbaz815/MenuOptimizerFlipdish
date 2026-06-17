'use client';

import Button from '@flipdish/portal-library/components/atoms/Button';
import Typography from '@flipdish/portal-library/components/atoms/Typography';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { getSafeCallbackUrl } from '@/lib/safe-callback-url';
import { useTheme } from './ThemeProvider';

export default function Home() {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    const safe = getSafeCallbackUrl(window.location.href, window.location.origin);
    router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(safe)}`);
  }, [status, router]);

  if (status === 'loading') {
    return (
      <main className="page">
        <Typography variant="body1">Loading...</Typography>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="page">
        <Typography variant="body1">Redirecting to sign in...</Typography>
      </main>
    );
  }

  const name = session?.user?.name ?? session?.user?.email ?? 'there';

  return (
    <main className="page">
      <div className="page-header">
        <Typography variant="h1">Hello, {name}!</Typography>
        <Button fdKey="theme-toggle" type="button" variant="tertiary" tone="neutral" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </Button>
      </div>
      <Typography variant="body2" className="muted">
        Signed in as {session?.user?.email}
      </Typography>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
        <Button fdKey="go-optimizer" type="button" variant="primary" tone="brand" onClick={() => router.push('/optimizer')}>
          Menu Optimizer
        </Button>
        <Button fdKey="go-preview" type="button" variant="primary" tone="brand" onClick={() => router.push('/preview')}>
          Menu Preview
        </Button>
      </div>
      <Typography variant="body2" className="muted" style={{ marginTop: '1rem' }}>
        Menu Optimizer: AI-powered menu analysis · Menu Preview: side-by-side comparison & reviewer
      </Typography>
      <Button fdKey="signout" type="button" variant="tertiary" tone="neutral" onClick={() => signOut({ callbackUrl: '/auth/signin' })} style={{ marginTop: '2rem' }}>
        Sign out
      </Button>
    </main>
  );
}
