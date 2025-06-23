
import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import pwa from "@ducanh2912/next-pwa";

const withNextIntl = createNextIntlPlugin();

const withPWA = pwa({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: false, // Always enable PWA functionality
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

// Apply withPWA to the core Next.js config, then wrap with withNextIntl
export default withNextIntl(withPWA(nextConfig));
