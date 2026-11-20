import { useEffect, useState } from 'react';
import { WS_SERVERS, isProduction } from '@/components/shared/utils/config/config';
import { lastDigit, MarketTick } from './digit-analysis';

type VolatilityMarket = { symbol: string; name: string };
export type FeedState = 'connecting' | 'live' | 'reconnecting' | 'error';
export function useDigitFeed(symbol: string, retry: number) {
    const [ticks, setTicks] = useState<MarketTick[]>([]);
    const [markets, setMarkets] = useState<VolatilityMarket[]>([]);
    const [precision, setPrecision] = useState<number | null>(null);
    const [status, setStatus] = useState<FeedState>('connecting');
    const [error, setError] = useState('');
    useEffect(() => {
        let disposed = false;
        let socket: WebSocket | undefined;
        let reconnect: ReturnType<typeof setTimeout>;
        let heartbeat: ReturnType<typeof setInterval>;
        let connectionTimeout: ReturnType<typeof setTimeout>;
        let attempts = 0;
        let decimals: number | null = null;
        let latestEpoch = -1;
        let lastMessage = Date.now();
        let pending: { epoch: number; quote: number }[] = [];
        setTicks([]); setPrecision(null); setError(''); setStatus('connecting');
        const apply = (incoming: { epoch: number; quote: number }[]) => {
            if (decimals === null) { pending.push(...incoming); return; }
            const fresh = [...pending, ...incoming].filter(tick => Number.isFinite(tick.epoch) && Number.isFinite(tick.quote) && tick.epoch > latestEpoch).sort((a, b) => a.epoch - b.epoch);
            pending = [];
            const next: MarketTick[] = [];
            for (const tick of fresh) {
                if (tick.epoch <= latestEpoch) continue;
                latestEpoch = tick.epoch;
                next.push({ ...tick, digit: lastDigit(tick.quote, decimals) });
            }
            if (next.length) { setTicks(previous => [...previous, ...next].slice(-1000)); setStatus('live'); setError(''); attempts = 0; }
        };
        const connect = () => {
            if (disposed) return;
            setStatus(attempts ? 'reconnecting' : 'connecting');
            decimals = null; latestEpoch = -1; pending = [];
            setTicks([]); setPrecision(null);
            const ws = new WebSocket(isProduction() ? WS_SERVERS.PRODUCTION : WS_SERVERS.STAGING);
            socket = ws;
            connectionTimeout = setTimeout(() => ws.close(), 15000);
            ws.onopen = () => {
                clearTimeout(connectionTimeout);
                lastMessage = Date.now();
                ws.send(JSON.stringify({ active_symbols: 'brief', req_id: 1 }));
                ws.send(JSON.stringify({ ticks_history: symbol, count: 1000, end: 'latest', style: 'ticks', subscribe: 1, adjust_start_time: 1, req_id: 2 }));
                heartbeat = setInterval(() => {
                    if (Date.now() - lastMessage > 45000) { ws.close(); return; }
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
                }, 20000);
                connectionTimeout = setTimeout(() => {
                    if (latestEpoch < 0) { setError('The market is not sending ticks. Reconnecting…'); ws.close(); }
                }, 20000);
            };
            ws.onmessage = event => {
                if (disposed || socket !== ws) return;
                lastMessage = Date.now();
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                if (data.error) {
                    if (data.req_id === 1) return;
                    setError(data.error.message || 'Unable to load market ticks.'); setStatus('error');
                    ws.onclose = null; clearInterval(heartbeat); clearTimeout(connectionTimeout); ws.close(); return;
                }
                if (data.active_symbols) {
                    const options: VolatilityMarket[] = data.active_symbols.filter(item => /volatility/i.test(item.display_name || item.underlying_symbol_name || '') && !item.is_trading_suspended).map(item => ({ symbol: item.underlying_symbol || item.symbol, name: item.display_name || item.underlying_symbol_name })).filter(item => item.symbol && item.name);
                    if (options.length) setMarkets(options.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
                }
                if (Number.isInteger(data.pip_size) && data.pip_size >= 0 && data.pip_size <= 12) { decimals = data.pip_size; setPrecision(decimals); }
                if (data.history) {
                    const history = data.history.times.map((epoch, index) => ({ epoch: Number(epoch), quote: Number(data.history.prices[index]) }));
                    apply(history);
                }
                if (data.tick && (!data.tick.symbol || data.tick.symbol === symbol)) {
                    if (Number.isInteger(data.tick.pip_size) && data.tick.pip_size >= 0 && data.tick.pip_size <= 12) { decimals = data.tick.pip_size; setPrecision(decimals); }
                    apply([{ epoch: Number(data.tick.epoch), quote: Number(data.tick.quote) }]);
                }
            };
            ws.onerror = () => { if (!disposed) setError('Connection interrupted. Reconnecting to Deriv…'); ws.close(); };
            ws.onclose = () => {
                clearInterval(heartbeat); clearTimeout(connectionTimeout);
                if (disposed) return;
                setStatus('reconnecting');
                reconnect = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30000));
            };
        };
        connect();
        return () => { disposed = true; clearTimeout(reconnect); clearTimeout(connectionTimeout); clearInterval(heartbeat); socket?.close(); };
    }, [symbol, retry]);
    return { ticks, markets, precision, status, error };
}
