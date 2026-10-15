import { createSafeActionClient } from 'next-safe-action';
import { log } from '@/lib/logger';

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    log.error('review action failed', { error: error.name });
    return 'REVIEW_FAILED';
  },
});
