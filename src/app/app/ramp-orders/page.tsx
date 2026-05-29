'use client';

import { Suspense } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import { RampOrdersPage } from '@/views/RampOrdersPage';

export default function RampOrdersRoutePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RampOrdersPage />
    </Suspense>
  );
}
