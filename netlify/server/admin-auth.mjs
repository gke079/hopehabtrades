// Validate the session with Identity itself; never trust decoded JWT claims or browser metadata.
export async function getAdminUser(request, fetchUser = fetch) {
    const cookie = request.headers.get('cookie') || '';
    const match = cookie.match(/(?:^|;\s*)nf_jwt=([^;]+)/);
    if (!match) return null;
    try {
        const token = decodeURIComponent(match[1]);
        const response = await fetchUser('https://hopehabtrades.netlify.app/.netlify/identity/user', {
            headers: { Authorization: `Bearer ${token}` },
            redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;
        const user = await response.json();
        return { id: user.id, roles: user.app_metadata?.roles || [] };
    } catch { return null; }
}
