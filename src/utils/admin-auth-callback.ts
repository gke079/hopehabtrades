import { handleAuthCallback } from '@netlify/identity';
import type { AdminCallback } from '@/components/admin-login';

export let adminCallback: AdminCallback = null;
export const clearAdminCallback = () => { adminCallback = null; };
export async function processAdminCallback() {
    try {
        const result = await handleAuthCallback();
        if (result) adminCallback = { type: result.type, ...('token' in result ? { token: result.token } : {}) };
    } finally {
        // Identity callbacks use the hash too. Mount the trading tabs only after it is consumed.
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#free_bots`);
    }
}
export const hasAdminCallback = () => /(?:^#|&)(invite_token|recovery_token|confirmation_token|email_change_token)=/.test(window.location.hash);
