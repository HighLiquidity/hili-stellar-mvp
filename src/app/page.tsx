'use client';

import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { isAuthorized, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthorized ? '/app/dashboard' : '/login');
    }
  }, [isAuthorized, isLoading, router]);

  return <LoadingScreen />;
}
