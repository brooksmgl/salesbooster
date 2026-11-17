import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Sales Booster' };

// maximumScale stops iOS from keeping a leftover zoom or zooming in on inputs.
// iOS still lets people pinch-zoom.
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body id="salesbooster-root" className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
