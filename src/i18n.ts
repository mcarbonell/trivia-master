import {getRequestConfig} from 'next-intl/server';
import { cookies } from 'next/headers';

// Can be imported from a shared config
const supportedLocales = ['en', 'es'];
const defaultLocale = 'en';
export const localeCookieName = 'NEXT_LOCALE';

export default getRequestConfig(async () => {
  // This function is called to get the config for the current request.
  // The locale can be determined dynamically here.
  let locale = cookies().get(localeCookieName)?.value;

  if (!locale || !supportedLocales.includes(locale)) {
    // No valid cookie from user preference yet.
    // For SSR, navigator.language is not available. accept-language header could be parsed
    // but it's more robust to let ClientLocaleInitializer set the cookie based on navigator.language
    // on the first client-side load.
    // So, for the very first SSR pass before client interaction, we default.
    locale = defaultLocale;
  }
  
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});