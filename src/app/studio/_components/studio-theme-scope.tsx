'use client';

import { useEffect } from 'react';

export function StudioThemeScope() {
  useEffect(() => {
    document.body.classList.add('studio-theme');

    return () => {
      document.body.classList.remove('studio-theme');
    };
  }, []);

  return null;
}
