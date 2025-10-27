import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Sales Booster' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body id="salesbooster-root" className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
