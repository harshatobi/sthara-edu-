import type { MetadataRoute } from 'next';

/**
 * Web app manifest: lets staff, students and parents add Sthara to a phone's
 * home screen and open it full-screen like an app. Starts at the sign-in page
 * (the site root is the public marketing site).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/login',
    name: 'Sthara',
    short_name: 'Sthara',
    description: 'Sthara, the Institutional OS for schools.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#03162E',
    theme_color: '#062347',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
