// Only public market data crosses into HopeLogic. Account and trading messages stay in the host.
export type MarketApi = { send: (request: any) => Promise<any>; onMessage: () => { subscribe: (callback: (event: any) => void) => { unsubscribe: () => void } } };
type Stream = { request: any; clients: Map<string, any>; history?: any; id?: string; latest?: any };
export function createMarketBridge(api: MarketApi, deliver: (socket: string, event: string, data?: any) => void) {
    const clients = new Set<string>();
    const streams = new Map<string, Stream>();
    let disposed = false;
    let queue = Promise.resolve();
    const marketRequest = (request: any) => {
        const result = queue.then(async () => {
            if (disposed) return {};
            return api.send(request);
        });
        // Pace background analysis subscriptions without delaying Bot Builder requests.
        queue = result.then(() => {}, () => {}).then(() => new Promise(resolve => setTimeout(resolve, 100)));
        return result;
    };
    const updateHistory = (stream: Stream, data: any) => {
        if (data.tick && stream.history?.history) {
            const history = stream.history.history;
            const tick = data.tick;
            if (Number(tick.epoch) > Number(history.times[history.times.length - 1])) {
                history.prices = [...history.prices, tick.quote].slice(-1000);
                history.times = [...history.times, tick.epoch].slice(-1000);
            }
            if (Number.isInteger(tick.pip_size)) stream.history.pip_size = tick.pip_size;
        }
        if (data.ohlc && stream.history?.candles) {
            const c = data.ohlc;
            const candle = {epoch: Number(c.open_time || c.epoch), open: c.open, high: c.high, low: c.low, close: c.close};
            const candles = stream.history.candles;
            const last = candles[candles.length - 1];
            if (last?.epoch === candle.epoch) candles[candles.length - 1] = candle;
            else if (!last || last.epoch < candle.epoch) stream.history.candles = [...candles, candle].slice(-100);
        }
    };
    const publicReply = (data: any, request: any) => {
        // Reconstruct replies; never forward an API response wholesale (echo_req may contain auth).
        const common = { echo_req: request, req_id: request.req_id, subscription: data.subscription?.id ? { id: data.subscription.id } : undefined };
        if (data.error) return { ...common, error: { code: 'MarketDataError', message: 'Unable to load this market. Try another market or reconnect the site.' } };
        if (data.history) return { ...common, msg_type: 'history', history: { prices: data.history.prices, times: data.history.times }, pip_size: data.pip_size };
        if (data.candles) return { ...common, msg_type: 'candles', candles: data.candles.map((c: any) => ({ epoch: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close })) };
        if (data.tick) { const t = data.tick; return { ...common, msg_type: 'tick', tick: { epoch: t.epoch, quote: t.quote, symbol: t.symbol, pip_size: t.pip_size } }; }
        if (data.ohlc) { const c = data.ohlc; return { ...common, msg_type: 'ohlc', ohlc: { symbol: c.symbol, epoch: c.epoch, open_time: c.open_time, open: c.open, high: c.high, low: c.low, close: c.close, granularity: c.granularity } }; }
        if (data.time) return { msg_type: 'time', time: data.time };
        return { msg_type: 'ping', ping: 'pong' };
    };
    const subscription = api.onMessage().subscribe(({data}) => {
        if (disposed || (!data?.tick && !data?.ohlc)) return;
        const item = data.tick || data.ohlc;
        for (const stream of streams.values()) {
            const r = stream.request;
            if (r.ticks_history !== item.symbol || (r.style === 'ticks') !== Boolean(data.tick) || (data.ohlc && Number(r.granularity) !== Number(item.granularity))) continue;
            // Live routing uses symbol/style, so a stream already owned by Bot Builder can be shared.
            stream.latest = data;
            updateHistory(stream, data);
            for (const [socket, request] of stream.clients) deliver(socket, 'message', publicReply(data, request));
        }
    });
    const release = (socket: string, style?: string) => {
        for (const [key, stream] of streams) {
            if (style && stream.request.style !== style) continue;
            stream.clients.delete(socket);
            if (!stream.clients.size) {
                streams.delete(key);
                if (stream.id) api.send({ forget: stream.id }).catch(() => {});
            }
        }
    };
    const receive = async (socket: string, event: string, raw?: unknown) => {
        if (disposed || typeof socket !== 'string' || socket.length > 80) return;
        if (event === 'open') { clients.add(socket); deliver(socket, 'open'); return; }
        if (event === 'close') { clients.delete(socket); release(socket); return; }
        if (event !== 'send' || !clients.has(socket) || typeof raw !== 'string' || raw.length > 3000) return;
        let incoming: any;
        try { incoming = JSON.parse(raw); } catch { return; }
        if (!incoming || typeof incoming !== 'object') return;
        if (incoming.forget_all === 'candles') { release(socket, 'candles'); return; }
        if (incoming.ping) { deliver(socket, 'message', {msg_type: 'ping', ping: 'pong'}); return; }
        if (incoming.time === 1) {
            try { const data = await api.send({time: 1}); if (!disposed && clients.has(socket)) deliver(socket, 'message', publicReply(data, {})); } catch {}
            return;
        }
        if (typeof incoming.ticks_history !== 'string' || !/^[a-zA-Z0-9_]{1,60}$/.test(incoming.ticks_history) || !['ticks','candles'].includes(incoming.style)) return;
        const granularity = Number(incoming.granularity);
        if (incoming.style === 'candles' && ![60,120,180,300,600,900,1800,3600,7200,14400,28800,86400].includes(granularity)) return;
        const request: any = { ticks_history: incoming.ticks_history, style: incoming.style, end: 'latest', count: incoming.style === 'ticks' ? 1000 : 100, subscribe: 1 };
        if (incoming.style === 'candles') request.granularity = granularity;
        const key = `${request.ticks_history}:${request.style}:${granularity || 0}`;
        const existing = streams.get(key);
        if (existing) {
            existing.clients.set(socket, request);
            if (existing.history) deliver(socket, 'message', publicReply(existing.history, request));

            return;
        }
        if (streams.size >= 200) return;
        const stream: Stream = { request, clients: new Map([[socket, request]]) };
        streams.set(key, stream);
        try {
            let data;
            try { data = await marketRequest(request); }
            catch (error: any) {
                if (error?.error?.code !== 'AlreadySubscribed' && error?.code !== 'AlreadySubscribed') throw error;
                // Read history while sharing live updates from a stream already owned by the site.
                const {subscribe: _subscribe, ...historyRequest} = request;
                data = await marketRequest(historyRequest);
            }
            if (data.error?.code === 'AlreadySubscribed') {
                const {subscribe: _subscribe, ...historyRequest} = request;
                data = await marketRequest(historyRequest);
            }
            // Remember only subscriptions created by this bridge; never forget Bot Builder streams.
            stream.id = data.subscription?.id;
            if (disposed || streams.get(key) !== stream) {
                if (stream.id) api.send({forget: stream.id}).catch(() => {});
                return;
            }
            // Retain only the market fields needed to replay history to another reader.
            stream.history = publicReply(data, request);
            if (stream.latest) updateHistory(stream, stream.latest);
            for (const [id, r] of stream.clients) deliver(id, 'message', publicReply(stream.history, r));
        } catch {
            if (!disposed) for (const [id, r] of stream.clients) deliver(id, 'message', publicReply({error: true}, r));
            streams.delete(key);
        }
    };
    return { receive, dispose: () => {
        disposed = true; subscription.unsubscribe();
        for (const socket of clients) { deliver(socket, 'close'); release(socket); }
        clients.clear();
    } };
}
