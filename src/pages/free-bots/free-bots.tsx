import { getUser } from '@netlify/identity';
import AdminLogin from '@/components/admin-login';
import { adminCallback, clearAdminCallback } from '@/utils/admin-auth-callback';
import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS, tabs_title } from '@/constants/bot-contents';
import './free-bots.scss';

type Bot = { id: string; name: string; description: string; xml?: string };
async function api(path = '', options?: RequestInit) {
    await getUser();
    const response = await fetch(`/api/${path}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
    return data;
}
export default observer(function FreeBots() {
    const { load_modal, dashboard, run_panel, blockly_store } = useStore();
    const [bots, setBots] = useState<Bot[]>([]);
    const [canManage, setCanManage] = useState(false);
    const [signedIn, setSignedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [editing, setEditing] = useState<Bot | null>(null);
    const [deleting, setDeleting] = useState<Bot | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [xml, setXml] = useState('');
    const refreshAuth = async () => {
        const user = await getUser();
        const access = await api('bot-admin');
        setSignedIn(!!user); setCanManage(access.canManage);
        if (!access.canManage) { setEditing(null); setDeleting(null); }
    };
    const refresh = async () => setBots(await api('free-bots'));
    const initialize = async () => {
        setLoading(true); setError('');
        try { const [items] = await Promise.all([api('free-bots'), refreshAuth()]); setBots(items); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { initialize(); }, []);
    const task = async (action: () => Promise<void>) => {
        setBusy(true); setError(''); setMessage('');
        try { await action(); } catch (e) { setError(e.message || 'Unable to complete this action.'); }
        finally { setBusy(false); }
    };
    const edit = (bot: Bot) => task(async () => {
        const full = await api(`free-bots/${bot.id}`);
        setEditing(full); setName(full.name); setDescription(full.description); setXml(full.xml);
    });
    const load = (bot: Bot) => task(async () => {
        if (run_panel.is_stop_button_visible) throw new Error('End the current bot session before loading another one.');
        const full = await api(`free-bots/${bot.id}`);
        await load_modal.loadStrategyToBuilder({ id: crypto.randomUUID(), name: full.name, xml: full.xml, save_type: 'local', timestamp: Date.now() });
        blockly_store.setActiveTab(String(tabs_title.WORKSPACE));
        dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
        window.dispatchEvent(new Event('resize'));
    });
    return <section className='free-bots'>
        <header><div><span className='free-bots__eyebrow'>BOT LIBRARY</span><h1>Free Bots</h1><p>Load an admin-published strategy into Bot Builder to review and run it.</p></div><button disabled={loading || busy} onClick={initialize}>Refresh library</button></header>
        {error && <p role='alert' className='free-bots__error'>{error}</p>}
        {message && <p role='status'>{message}</p>}
        {loading ? <p role='status'>Loading bot library…</p> : <div className='free-bots__list'>
            {!bots.length && <p className='free-bots__empty'>No free bots have been published yet. Published bots appear here for everyone.</p>}
            {bots.map(bot => <article key={bot.id}><div><h2><button className='free-bots__select' disabled={busy || run_panel.is_stop_button_visible} onClick={() => load(bot)}>{bot.name}</button></h2><p>{bot.description || 'Open this strategy in Bot Builder to review its settings.'}</p></div><div className='free-bots__actions'><button disabled={busy || run_panel.is_stop_button_visible} onClick={() => load(bot)}>Load bot</button>{canManage && <><button disabled={busy} onClick={() => edit(bot)}>Edit</button><button disabled={busy} onClick={() => setDeleting(bot)}>Delete</button></>}</div></article>)}
        </div>}
        {deleting && <div role='alertdialog' aria-label='Delete bot' className='free-bots__editor'><p>Delete “{deleting.name}” from the shared library? Existing user copies remain available.</p><button disabled={busy} onClick={() => task(async () => { await api(`free-bots/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); await refresh(); setMessage('Bot deleted.'); })}>Delete permanently</button><button disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div>}
        <aside className='free-bots__editor'><h2>Admin workspace</h2>
            <AdminLogin canManage={canManage} signedIn={signedIn} callback={adminCallback} onChange={async () => { clearAdminCallback(); await refreshAuth(); }} />
            {canManage && <form onSubmit={event => { event.preventDefault(); task(async () => {
                await api(editing ? `free-bots/${editing.id}` : 'free-bots', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, xml }) });
                setEditing(null); setName(''); setDescription(''); setXml(''); await refresh(); setMessage('Bot published to the library.');
            }); }}>
                <h3>{editing ? `Update ${editing.name}` : 'Publish a bot'}</h3>
                <label>Bot name<input required maxLength={120} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
                <label>Description<textarea maxLength={2000} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} /></label>
                <label>{editing ? 'Replace XML (optional)' : 'Import bot XML'}<input key={editing?.id || xml.length} type='file' accept='.xml,text/xml,application/xml' disabled={busy} onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    task(async () => { if (file.size > 2000000) throw new Error('Choose an XML file under 2 MB.'); const content = await file.text(); const parsed = new DOMParser().parseFromString(content, 'text/xml'); if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'xml' || !parsed.querySelector('block[type="trade_definition"]')) throw new Error('Choose a valid Blockly trading bot XML file.'); setXml(content); if (!name) setName(file.name.replace(/\.xml$/i, '').slice(0, 120)); });
                }} /></label>
                <p>{xml ? 'Bot XML is ready to publish.' : 'Choose an exported Blockly bot XML file (maximum 2 MB).'}</p>
                <div className='free-bots__actions'><button type='submit' disabled={busy || !xml || !name.trim()}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish bot'}</button>{editing && <button type='button' disabled={busy} onClick={() => { setEditing(null); setName(''); setDescription(''); setXml(''); }}>Cancel editing</button>}</div>
            </form>}
        </aside>
    </section>;
});
