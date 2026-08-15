import '@/lib/server/only';

import { RampDisabledError } from './ramp-disabled';
import { loadPlatformRampFlags } from './store';

export async function assertUsdcRampEnabled(): Promise<void> {
  const flags = await loadPlatformRampFlags();
  if (!flags.ok) {
    throw new Error(flags.reason);
  }
  if (!flags.data.usdcRampEnabled) {
    throw new RampDisabledError('usdc');
  }
}

export async function assertBrhRampEnabled(): Promise<void> {
  const flags = await loadPlatformRampFlags();
  if (!flags.ok) {
    throw new Error(flags.reason);
  }
  if (!flags.data.brhRampEnabled) {
    throw new RampDisabledError('brh');
  }
}
