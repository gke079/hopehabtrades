import React, { useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { connectionStatus$, CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { createMarketBridge } from './market-bridge';
import { createTradeBridge, HOPELOGIC_TRADE_CHANNEL, TradeAccountLite } from './trade-bridge';
import './hopelogic.scss';

const toAccountLite = (loginid: string, currency: string, balance: number): TradeAccountLite => ({
    loginid,
    currency: currency || 'USD',
    balance: Number(balance) || 0,
    is_virtual: /^VR/i.test(loginid),
});

export default function HopeLogic({ view }: { view?: string } = {}) {
    const frame = useRef<HTMLIFrameElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [retry, setRetry] = useState(0);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const timeout = setTimeout(() => { if (!loaded) setFailed(true); }, 25000);
        return () => clearTimeout(timeout);
    }, [loaded, retry]);
    useEffect(() => {
        let bridge: ReturnType<typeof createMarketBridge> | undefined;
        let tradeBridge: ReturnType<typeof createTradeBridge> | undefined;
        let currentApi: any;
        const deliver = (socket: string, event: string, data?: any) => frame.current?.contentWindow?.postMessage({channel: 'hopelogic-market-v1', socket, event, data}, window.location.origin);
        const deliverTrade = (socket: string, event: string, data?: any) => frame.current?.contentWindow?.postMessage({channel: HOPELOGIC_TRADE_CHANNEL, socket, event, data}, window.location.origin);
        const getAccounts = () => {
            const stored = DerivWSAccountsService.getStoredAccounts() ?? [];
            const accounts = stored
                .filter(a => !a.status || a.status === 'active')
                .map(a => toAccountLite(a.account_id, a.currency, parseFloat(a.balance) || 0));
            const info: any = api_base.account_info || {};
            const current = info.loginid
                ? toAccountLite(info.loginid, info.currency, info.balance)
                : null;
            return {
                accounts: accounts.length ? accounts : current ? [current] : [],
                current,
            };
        };
        const switchAccount = async (loginid: string) => {
            const stored = DerivWSAccountsService.getStoredAccounts() ?? [];
            if (!stored.some(a => a.account_id === loginid)) return false;
            localStorage.setItem('active_loginid', loginid);
            const clientStore: any = globalObserver.getState('client.store');
            if (typeof clientStore?.checkAndRegenerateWebSocket === 'function') {
                clientStore.checkAndRegenerateWebSocket();
            } else {
                await api_base.init(true);
            }
            return true;
        };
        const sync = () => {
            const next = connectionStatus$.value === CONNECTION_STATUS.OPENED ? api_base.api : undefined;
            if (next === currentApi) return;
            bridge?.dispose(); bridge = undefined;
            tradeBridge?.dispose(); tradeBridge = undefined;
            currentApi = next;
            if (next) {
                bridge = createMarketBridge(next as unknown as Parameters<typeof createMarketBridge>[0], deliver);
                tradeBridge = createTradeBridge(next as unknown as Parameters<typeof createTradeBridge>[0], deliverTrade, { getAccounts, switchAccount });
            }
        };
        const receive = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
            if (event.data?.channel === HOPELOGIC_TRADE_CHANNEL) {
                sync();
                void tradeBridge?.receive(event.data.socket, event.data.event, event.data.data);
                return;
            }
            if (event.data?.channel !== 'hopelogic-market-v1') return;
            if (event.data.event === 'ready') { setLoaded(true); setFailed(false); return; }
            sync(); void bridge?.receive(event.data.socket, event.data.event, event.data.data);
        };
        sync();
        window.addEventListener('message', receive);
        const timer = setInterval(sync, 500);
        return () => { clearInterval(timer); window.removeEventListener('message', receive); bridge?.dispose(); tradeBridge?.dispose(); };
    }, [retry]);
    const prefix = process.env.NEXT_PUBLIC_APP_BUILD === 'true' ? '/bot/preview' : '';
    const src = view ? `${prefix}/hopelogic.html?view=${encodeURIComponent(view)}` : `${prefix}/hopelogic.html`;
    const isSignals = view === 'signals';
    return <section className='hopelogic' aria-label={isSignals ? 'Signals workspace' : 'HopeLogic workspace'}>
        {!loaded && <div className='hopelogic__loading' role='status'>{failed ? (isSignals ? 'Signals could not load.' : 'HopeLogic could not load.') : (isSignals ? 'Loading signals…' : 'Loading HopeLogic…')}{failed && <button onClick={() => {setLoaded(false); setFailed(false); setRetry(value => value + 1);}}>Try again</button>}</div>}
        <iframe key={retry} ref={frame} src={src} title={isSignals ? 'Live market signals and account trading' : 'HopeLogic market analysis and strategy workspace'} allow='fullscreen' />
    </section>;
}
