'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { LoadingScreen } from '@/components/LoadingScreen';
import { OnrampPage } from '@/views/OnrampPage';

function OnrampRouteContent() {
  const orderId = useSearchParams().get('orderId');
  return <OnrampPage initialOrderId={orderId} />;
}

export default function OnrampRoutePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OnrampRouteContent />
    </Suspense>
  );
}
