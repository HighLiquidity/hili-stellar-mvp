'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AppIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app/dashboard');
  }, [router]);

  return null;
}
