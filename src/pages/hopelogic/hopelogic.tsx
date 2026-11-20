import React, { useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { connectionStatus$, CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { createMarketBridge } from './market-bridge';
import './hopelogic.scss';

export default function HopeLogic() {
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
        let currentApi: any;
        const deliver = (socket: string, event: string, data?: any) => frame.current?.contentWindow?.postMessage({channel: 'hopelogic-market-v1', socket, event, data}, window.location.origin);
        const sync = () => {
            const next = connectionStatus$.value === CONNECTION_STATUS.OPENED ? api_base.api : undefined;
            if (next === currentApi) return;
            bridge?.dispose(); bridge = undefined; currentApi = next;
            if (next) bridge = createMarketBridge(next as unknown as Parameters<typeof createMarketBridge>[0], deliver);
        };
        const receive = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'hopelogic-market-v1') return;
            if (event.data.event === 'ready') { setLoaded(true); setFailed(false); return; }
            sync(); void bridge?.receive(event.data.socket, event.data.event, event.data.data);
        };
        sync();
        window.addEventListener('message', receive);
        const timer = setInterval(sync, 500);
        return () => { clearInterval(timer); window.removeEventListener('message', receive); bridge?.dispose(); };
    }, [retry]);
    const prefix = process.env.NEXT_PUBLIC_APP_BUILD === 'true' ? '/bot/preview' : '';
    return <section className='hopelogic' aria-label='HopeLogic workspace'>
        {!loaded && <div className='hopelogic__loading' role='status'>{failed ? 'HopeLogic could not load.' : 'Loading HopeLogic…'}{failed && <button onClick={() => {setLoaded(false); setFailed(false); setRetry(value => value + 1);}}>Try again</button>}</div>}
        <iframe key={retry} ref={frame} src={`${prefix}/hopelogic.html`} title='HopeLogic market analysis and strategy workspace' allow='fullscreen' />
    </section>;
}
