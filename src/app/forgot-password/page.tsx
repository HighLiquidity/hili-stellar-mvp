'use client';

import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { ForgotPasswordPage } from '@/views/ForgotPasswordPage';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ForgotPasswordRoutePage() {
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

  return <ForgotPasswordPage />;
}
