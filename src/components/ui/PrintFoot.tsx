'use client';

import { useEffect } from 'react';

/**
 * Marks the document when the browser can't print page-margin boxes (Safari, Firefox), so globals.css draws the
 * "Powered by Sthara" foot in the page instead. Chrome and Edge print it in the margin and need nothing.
 */
export default function PrintFoot() {
  useEffect(() => {
    if (!('CSSMarginRule' in window)) document.documentElement.classList.add('no-margin-boxes');
  }, []);
  return null;
}
