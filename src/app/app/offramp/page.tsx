'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { LoadingScreen } from '@/components/LoadingScreen';
import { OfframpPage } from '@/views/OfframpPage';

function OfframpRouteContent() {
  const orderId = useSearchParams().get('orderId');
  return <OfframpPage initialOrderId={orderId} />;
}

export default function OfframpRoutePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OfframpRouteContent />
    </Suspense>
  );
}
