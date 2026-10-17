'use client';

import { useRef } from 'react';

/** Prints just this card (canon.css: body.print-one shows only .print-me). */
export function usePrintOne() {
  const box = useRef<HTMLDivElement>(null);
  const print = () => {
    const el = box.current;
    if (!el) return;
    el.classList.add('print-me'); document.body.classList.add('print-one');
    const done = () => { el.classList.remove('print-me'); document.body.classList.remove('print-one'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  return { box, print };
}
