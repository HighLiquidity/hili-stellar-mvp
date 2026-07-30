import { Suspense } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import { UserWithdrawWhitelistPage } from '@/views/UserWithdrawWhitelistPage';

export default function WithdrawWhitelistRoutePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <UserWithdrawWhitelistPage />
    </Suspense>
  );
}
