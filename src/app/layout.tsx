import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import {NextIntlClientProvider} from 'next-intl';
import {getLocale, getMessages} from 'next-intl/server';
import { ClientLocaleInitializer } from '@/components/ClientLocaleInitializer';

// Define metadata function to allow dynamic title based on locale
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  // Minimal messages for metadata, or fetch all and pick.
  // For simplicity, hardcoding or fetching just the title.
  // Ideally, you'd use getMessages and pick the title.
  // const messages = await getMessages();
  // const pageTitle = messages.pageTitle as string || 'AI Trivia Master';
  const pageTitle = locale === 'es' ? 'Maestro de Trivia IA' : 'AI Trivia Master';

  return {
    title: pageTitle,
    description: 'Test your knowledge with AI-generated trivia questions!',
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
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
      </head>
      <body className="font-body antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientLocaleInitializer />
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
