import React, { useState } from 'react';
import { login, logout, requestPasswordRecovery, acceptInvite, updateUser } from '@netlify/identity';

export type AdminCallback = { type: string; token?: string } | null;
export default function AdminLogin({ canManage, signedIn, callback, onChange }: {
    canManage: boolean; signedIn: boolean; callback: AdminCallback; onChange: () => Promise<void>;
}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [passwordFlow, setPasswordFlow] = useState(callback);
    const run = async (action: () => Promise<void>) => {
        setBusy(true); setError(''); setMessage('');
        try { await action(); } catch { setError('Unable to complete sign-in. Check your details or request a new invitation or reset link.'); }
        finally { setBusy(false); }
    };
    const needsPassword = passwordFlow?.type === 'invite' || passwordFlow?.type === 'recovery';
    return <div className='admin-login'>
        {error && <p role='alert'>{error}</p>}{message && <p role='status'>{message}</p>}
        {signedIn && !needsPassword ? <>
            <p>{canManage ? 'Signed in as an administrator.' : 'This account does not have admin access. The site owner must assign the admin role.'}</p>
            <button disabled={busy} onClick={() => run(async () => { await logout(); setPassword(''); await onChange(); })}>Sign out</button>
        </> : <form onSubmit={event => { event.preventDefault(); run(async () => {
            if (passwordFlow?.type === 'invite' && passwordFlow.token) await acceptInvite(passwordFlow.token, password);
            else if (passwordFlow?.type === 'recovery') await updateUser({ password });
            else await login(email, password);
            setPassword(''); setPasswordFlow(null); await onChange();
        }); }}>
            <h3>{needsPassword ? 'Set your admin password' : 'Admin sign in'}</h3>
            {!needsPassword && <label>Email<input type='email' autoComplete='username' required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>}
            <label>{needsPassword ? 'New password' : 'Password'}<input type='password' autoComplete={needsPassword ? 'new-password' : 'current-password'} minLength={needsPassword ? 8 : undefined} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
            <div className='free-bots__actions'><button disabled={busy} type='submit'>{busy ? 'Please wait…' : needsPassword ? 'Save password' : 'Sign in'}</button>
                {!needsPassword && <button type='button' disabled={busy || !email} onClick={() => run(async () => { await requestPasswordRecovery(email); setMessage('Check your email for a password reset link.'); })}>Reset password</button>}
            </div>
        </form>}
    </div>;
}
