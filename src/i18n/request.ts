
import {getRequestConfig} from 'next-intl/server';
import { cookies } from 'next/headers';
import { supportedLocales, defaultLocale, localeCookieName, type AppLocale } from '@/lib/i18n-config';
import messagesEn from '../messages/en.json';
import messagesEs from '../messages/es.json';

const messages: Record<string, any> = {
  en: messagesEn,
  es: messagesEs,
};

export default getRequestConfig(async ({locale: localeFromNextIntl}) => {
  // Attempt to get locale from cookie
  // Await cookies() to satisfy Next.js warning: https://nextjs.org/docs/messages/sync-dynamic-apis
  const cookieStore = await cookies(); 
  const cookieLocale = cookieStore.get(localeCookieName)?.value as AppLocale | undefined;

  let resolvedLocale: AppLocale = defaultLocale;

  if (cookieLocale && supportedLocales.includes(cookieLocale)) {
    resolvedLocale = cookieLocale;
  } else if (supportedLocales.includes(localeFromNextIntl as AppLocale)) {
    // Use the locale passed by next-intl if cookie is not set or invalid
    resolvedLocale = localeFromNextIntl as AppLocale;
  }
  // If neither cookie nor next-intl locale is valid, resolvedLocale remains defaultLocale

  return {
    locale: resolvedLocale,
    messages: messages[resolvedLocale] || messages[defaultLocale], // Fallback to default messages if resolved locale's messages are missing
  };
});

