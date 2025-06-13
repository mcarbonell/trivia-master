
import {getRequestConfig} from 'next-intl/server';
import { cookies } from 'next/headers';
import { supportedLocales, defaultLocale, localeCookieName, type AppLocale } from '@/lib/i18n-config';
import messagesEn from '../messages/en.json';
import messagesEs from '../messages/es.json';

const messages: Record<string, any> = {
  en: messagesEn,
  es: messagesEs,
};

export default getRequestConfig(async () => {
  // Attempt to get locale from cookie
  // Await cookies() to satisfy Next.js warning: https://nextjs.org/docs/messages/sync-dynamic-apis
  const cookieStore = await cookies(); 
  const cookieLocale = cookieStore.get(localeCookieName)?.value as AppLocale | undefined;

  let resolvedLocale: AppLocale = defaultLocale;

  if (cookieLocale && supportedLocales.includes(cookieLocale)) {
    resolvedLocale = cookieLocale;
  }
  // No fallback to localeFromNextIntl as it's not in the function signature for this setup type

  return {
    locale: resolvedLocale,
    messages: messages[resolvedLocale] || messages[defaultLocale], // Fallback to default messages if resolved locale's messages are missing
  };
});

