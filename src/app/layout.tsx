import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ClientLocaleInitializer } from '@/components/ClientLocaleInitializer';
import { AuthProvider } from '@/contexts/AuthContext';
import Link from 'next/link';

// Define metadata function to allow dynamic title based on locale
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const messages = await getMessages();
  const pageTitle = messages.pageTitle as string || (locale === 'es' ? 'Maestro de Trivia IA' : 'AI Trivia Master');

  return {
    title: pageTitle,
    description: 'Test your knowledge with AI-generated trivia questions!',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: pageTitle,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F0F2F5' },
    { media: '(prefers-color-scheme: dark)', color: '#1C1E24' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="font-body antialiased text-foreground bg-background">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <ClientLocaleInitializer />
            {children}
            <Toaster />
            <footer className="py-4 text-center text-xs text-muted-foreground">
              <Link href="/about" className="hover:text-primary underline underline-offset-2">
                {messages.AboutPage?.title ?? (locale === 'es' ? 'Acerca de / Contactar' : 'About / Contact')}
              </Link>
            </footer>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
