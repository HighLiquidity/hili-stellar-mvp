'use client';

import dynamic from 'next/dynamic';

import { LoadingScreen } from '@/components/LoadingScreen';

const StatementPage = dynamic(
  () => import('@/views/StatementPage').then((mod) => mod.StatementPage),
  { loading: () => <LoadingScreen />, ssr: false },
);

export default function StatementRoutePage() {
  return <StatementPage />;
}
