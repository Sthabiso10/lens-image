import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

/**
 * One typeface for the interface, one for code. Headings differ from body text
 * by weight and tracking rather than by family. A second display face would add
 * expression the site does not need.
 */
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://lens-image-docs.vercel.app'),
  title: {
    default: 'Lens: composable image optimization for Node.js',
    template: '%s · Lens',
  },
  description:
    'Resize, compress and convert images, then hand them to whatever storage you already use. Zero dependencies in the core, pluggable adapters for S3, filesystem and Cloudinary.',
  openGraph: {
    type: 'website',
    url: 'https://lens-image-docs.vercel.app',
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
  themeColor: '#08090a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
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
