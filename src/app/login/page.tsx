'use client';

import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/views/LoginPage';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginRoutePage() {
  const { isAuthorized, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthorized) {
      router.replace('/app/dashboard');
    }
  }, [isAuthorized, isLoading, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthorized) {
    return <LoadingScreen />;
  }

  return <LoginPage />;
}
