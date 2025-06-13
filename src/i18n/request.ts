import {getRequestConfig} from 'next-intl/server';
import { cookies } from 'next/headers';
import { supportedLocales, defaultLocale, localeCookieName, type AppLocale } from '@/lib/i18n-config';

export default getRequestConfig(async () => {
  // Attempt to get locale from cookie
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value as AppLocale | undefined;

  let resolvedLocale: AppLocale = defaultLocale;

  if (cookieLocale && supportedLocales.includes(cookieLocale)) {
    resolvedLocale = cookieLocale;
  }
  // If no valid cookie, resolvedLocale remains defaultLocale (e.g., 'en')
  // No need to check browser headers here as this is server-side.
  // ClientLocaleInitializer will handle initial browser lang detection.

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default
  };
});
