'use client';

import { AppShell } from '@/layouts/AppShell';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, type PropsWithChildren } from 'react';

export default function AppAreaLayout({ children }: PropsWithChildren) {
  const { isAuthorized, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthorized) {
      router.replace('/login');
    }
  }, [isAuthorized, isLoading, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthorized) {
    return <LoadingScreen />;
  }

  return <AppShell>{children}</AppShell>;
}
