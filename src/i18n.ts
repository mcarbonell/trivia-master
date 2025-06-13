
import {getRequestConfig} from 'next-intl/server';
import {cookies} from 'next/headers';
import {defaultLocale, supportedLocales, localeCookieName, type AppLocale} from '@/lib/i18n-config';

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  let locale = cookieStore.get(localeCookieName)?.value as AppLocale | undefined;

  if (!locale || !supportedLocales.includes(locale)) {
    // Fallback to default locale if no valid cookie is found
    // We could also check 'Accept-Language' header here, but for simplicity,
    // we'll rely on ClientLocaleInitializer to set the cookie based on browser language.
    locale = defaultLocale;
  }

  // Load messages for the determined locale.
  // Using an alias for robust path resolution.
  const messages = (await import(`@/messages/${locale}.json`)).default;

  return {
    locale,
    messages
  };
});
