import type { Metadata } from 'next';
import './globals.css';
import Providers from './Providers';

export const metadata: Metadata = {
  title: 'Menu Optimizer',
  description: 'Flipdish Menu Optimizer & Preview Tool',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
