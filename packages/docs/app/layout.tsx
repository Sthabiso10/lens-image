import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

/**
 * Inter for the interface, JetBrains Mono for code, and Inter Tight for display
 * headings. Inter Tight is the same drawing as Inter with tighter spacing, so
 * large type reads as one family with the body rather than a second voice, and
 * it holds up at the -0.05em tracking the biggest sizes use.
 *
 * The CSS variable is `--font-inter-tight` rather than `--font-display`: the
 * Tailwind token in globals.css is called `--font-display` and points at this
 * one, and a variable cannot be defined in terms of itself.
 */
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const display = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://lens-image.sthabisod10.workers.dev'),
  title: {
    default: 'Lens: composable image optimization for Node.js',
    template: '%s · Lens',
  },
  description:
    'Resize, compress and convert images, then hand them to whatever storage you already use. Zero dependencies in the core, pluggable adapters for S3, filesystem and Cloudinary.',
  openGraph: {
    type: 'website',
    url: 'https://lens-image.sthabisod10.workers.dev',
    siteName: 'Lens',
    title: 'Lens: composable image optimization for Node.js',
    description:
      'A dependency-free processing core, storage as an interface, and graceful degradation when a format is unavailable.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lens: composable image optimization for Node.js',
    description:
      'A dependency-free processing core, storage as an interface, and graceful degradation when a format is unavailable.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="pt-12">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
