// Host-side trade bridge for HopeLogic. Executes whitelisted, sanitized trade
// calls on the site's authorized Deriv connection. Account credentials never
// cross the bridge; the tool only ever sees public contract and balance data.
export type TradeApi = {
    send: (request: any) => Promise<any>;
    onMessage: () => { subscribe: (callback: (event: any) => void) => { unsubscribe: () => void } };
};

export interface TradeAccountLite {
    loginid: string;
    currency: string;
    balance: number;
    is_virtual: boolean;
}

export interface TradeBridgeOptions {
    getAccounts: () => { accounts: TradeAccountLite[]; current: TradeAccountLite | null };
    switchAccount: (loginid: string) => Promise<boolean> | boolean;
}

export const HOPELOGIC_TRADE_CHANNEL = 'hopelogic-trade-v1';

const TRADE_CALL_KEYS = ['balance', 'proposal', 'buy', 'sell', 'proposal_open_contract'];
const ALLOWED_FORGET_ALL = new Set(['balance', 'proposal_open_contract']);
const SYMBOL_PATTERN = /^[A-Z0-9_]{1,60}$/;
const CONTRACT_TYPE_PATTERN = /^[A-Z_]{3,40}$/;
const MAX_STREAMS = 40;

const pick = (source: any, fields: string[]) => {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
        if (source?.[field] !== undefined && source?.[field] !== null) out[field] = source[field];
    }
    return out;
};

const BALANCE_FIELDS = ['balance', 'currency', 'loginid', 'demo_account'];
const PROPOSAL_FIELDS = ['id', 'ask_price', 'payout', 'display_value', 'longcode', 'spot', 'is_valid'];
const BUY_FIELDS = ['contract_id', 'transaction_id', 'buy_price', 'payout', 'purchase_time', 'start_time', 'longcode', 'balance_after'];
const POC_FIELDS = [
    'contract_id', 'transaction_id', 'contract_type', 'underlying', 'status', 'is_sold', 'is_expired',
    'is_valid_to_sell', 'profit', 'payout', 'buy_price', 'sell_price', 'entry_tick', 'exit_tick',
    'current_spot', 'date_start', 'date_expiry', 'is_virtual', 'currency', 'tick_count',
];
const SELL_FIELDS = ['sold_for', 'balance_after', 'transaction_id', 'contract_id'];

type Stream = { request: any; sockets: Set<string>; id?: string; latest?: any };

const isSettled = (poc: any) =>
    Boolean(poc?.is_sold || poc?.is_expired) || ['won', 'lost'].includes(String(poc?.status || '').toLowerCase());

export function createTradeBridge(api: TradeApi, deliver: (socket: string, event: string, data?: any) => void, options: TradeBridgeOptions) {
    const clients = new Set<string>();
    const streams = new Map<string, Stream>();
    let disposed = false;

    const publicReply = (data: any, request: any, reqId?: unknown) => {
        const common: Record<string, unknown> = { echo_req: request, req_id: reqId };
        if (data?.subscription?.id) common.subscription = { id: data.subscription.id };
        if (data?.error) return { ...common, error: { code: data.error.code, message: data.error.message } };
        if (data?.msg_type === 'balance' && data.balance) return { ...common, msg_type: 'balance', balance: pick(data.balance, BALANCE_FIELDS) };
        if (data?.msg_type === 'proposal' && data.proposal) return { ...common, msg_type: 'proposal', proposal: pick(data.proposal, PROPOSAL_FIELDS) };
        if (data?.msg_type === 'buy' && data.buy) return { ...common, msg_type: 'buy', buy: pick(data.buy, BUY_FIELDS) };
        if (data?.msg_type === 'sell' && data.sell) return { ...common, msg_type: 'sell', sell: pick(data.sell, SELL_FIELDS) };
        if (data?.msg_type === 'proposal_open_contract' && data.proposal_open_contract) return { ...common, msg_type: 'proposal_open_contract', proposal_open_contract: pick(data.proposal_open_contract, POC_FIELDS) };
        return { ...common, msg_type: 'ping', ping: 'pong' };
    };

    const sanitizeProposalRequest = (incoming: any) => {
        const amount = Number(incoming.amount);
        const duration = Number(incoming.duration);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
        if (!Number.isFinite(duration) || duration < 1 || duration > 1440) return null;
        if (!SYMBOL_PATTERN.test(String(incoming.symbol || ''))) return null;
        if (!CONTRACT_TYPE_PATTERN.test(String(incoming.contract_type || ''))) return null;
        if (incoming.basis !== 'stake') return null;
        const request: any = {
            proposal: 1,
            amount,
            basis: 'stake',
            contract_type: String(incoming.contract_type),
            currency: typeof incoming.currency === 'string' ? incoming.currency.slice(0, 10) : 'USD',
            duration: Math.round(duration),
            duration_unit: ['t', 's', 'm'].includes(incoming.duration_unit) ? incoming.duration_unit : 't',
            symbol: String(incoming.symbol),
        };
        if (incoming.barrier !== undefined && incoming.barrier !== null) request.barrier = String(incoming.barrier).slice(0, 20);
        if (incoming.barrier2 !== undefined && incoming.barrier2 !== null) request.barrier2 = String(incoming.barrier2).slice(0, 20);
        return request;
    };

    const sanitizeStreamRequest = (incoming: any, key: string) => {
        if (key === 'balance') return { balance: 1, subscribe: 1 };
        const contractId = Number(incoming.contract_id);
        if (!Number.isInteger(contractId) || contractId <= 0) return null;
        return { proposal_open_contract: 1, contract_id: contractId, subscribe: 1 };
    };

    const release = (socket: string, call?: string) => {
        for (const [key, stream] of streams) {
            if (call && call !== key && !key.startsWith(`${call}:`)) continue;
            stream.sockets.delete(socket);
            if (!stream.sockets.size) {
                streams.delete(key);
                if (stream.id) api.send({ forget: stream.id }).catch(() => {});
            }
        }
    };

    const forgetStream = (key: string) => {
        const stream = streams.get(key);
        if (!stream) return;
        streams.delete(key);
        if (stream.id) api.send({ forget: stream.id }).catch(() => {});
    };

    const routeTradeCall = async (socket: string, incoming: any) => {
        if (disposed) return;
        let call: string | null = null;
        for (const key of TRADE_CALL_KEYS) if (incoming[key] !== undefined) call = call ? null : key;
        if (!call) return;
        const reqId = incoming.req_id;
        try {
            if (call === 'buy') {
                const proposalId = String(incoming.buy);
                if (!/^[\w-]{1,80}$/.test(proposalId)) return;
                const price = Number(incoming.price);
                if (!Number.isFinite(price) || price <= 0) return;
                const reply = publicReply(await api.send({ buy: proposalId, price }), { buy: proposalId, price }, reqId);
                deliver(socket, 'message', reply);
                return;
            }
            if (call === 'sell') {
                const contractId = Number(incoming.sell);
                if (!Number.isInteger(contractId) || contractId <= 0) return;
                const reply = publicReply(await api.send({ sell: contractId, price: 0 }), { sell: contractId }, reqId);
                deliver(socket, 'message', reply);
                return;
            }
            if (call === 'proposal') {
                const request = sanitizeProposalRequest(incoming);
                if (!request) return;
                deliver(socket, 'message', publicReply(await api.send(request), request, reqId));
                return;
            }
            // balance / proposal_open_contract streams
            const request = sanitizeStreamRequest(incoming, call);
            if (!request) return;
            const key = call === 'balance' ? 'balance' : `proposal_open_contract:${request.contract_id}`;
            let stream = streams.get(key);
            if (!stream) {
                if (streams.size >= MAX_STREAMS) return;
                stream = { request, sockets: new Set([socket]) };
                streams.set(key, stream);
                const data = await api.send(request);
                if (disposed || streams.get(key) !== stream) {
                    if (stream.id) api.send({ forget: stream.id }).catch(() => {});
                    return;
                }
                stream.id = data?.subscription?.id;
                stream.latest = data;
                deliver(socket, 'message', publicReply(data, request, reqId));
                // Deriv keeps streaming this contract forever; drop it if already settled.
                if (stream.id && isSettled(data?.proposal_open_contract)) forgetStream(key);
            } else {
                stream.sockets.add(socket);
                if (stream.latest) deliver(socket, 'message', publicReply(stream.latest, request, reqId));
            }
        } catch (error: any) {
            if (!disposed && clients.has(socket)) {
                deliver(socket, 'message', publicReply(
                    { error: error?.error || { code: 'TradeBridgeError', message: error?.message || 'Trade request failed' } },
                    incoming,
                    reqId
                ));
            }
        }
    };

    const subscription = api.onMessage().subscribe(({ data }: any) => {
        if (disposed) return;
        const msgType = data?.msg_type;
        if (msgType !== 'balance' && msgType !== 'proposal_open_contract') return;
        const streamId = data?.subscription?.id;
        for (const [key, stream] of streams) {
            if (!stream.id || stream.id !== streamId) continue;
            stream.latest = data;
            for (const socket of stream.sockets) deliver(socket, 'message', publicReply(data, stream.request, stream.request.req_id));
            if (msgType === 'proposal_open_contract' && isSettled(data?.proposal_open_contract)) forgetStream(key);
            return;
        }
        // Site-owned streams (subscribed outside this bridge) still carry live data; route by shape.
        for (const [key, stream] of streams) {
            if (stream.id) continue;
            const matches = key === 'balance' ? Boolean(data.balance) : Number(data.proposal_open_contract?.contract_id) === Number(key.split(':')[1]);
            if (matches) {
                stream.latest = data;
                for (const socket of stream.sockets) deliver(socket, 'message', publicReply(data, stream.request, stream.request.req_id));
                if (msgType === 'proposal_open_contract' && isSettled(data?.proposal_open_contract)) forgetStream(key);
            }
        }
    });

    const receive = async (socket: string, event: string, raw?: unknown) => {
        if (disposed || typeof socket !== 'string' || socket.length > 80) return;
        if (event === 'open') { clients.add(socket); deliver(socket, 'open'); return; }
        if (event === 'close') { clients.delete(socket); release(socket); return; }
        if (event !== 'send' || !clients.has(socket) || typeof raw !== 'string' || raw.length > 3000) return;
        let incoming: any;
        try { incoming = JSON.parse(raw); } catch { return; }
        if (!incoming || typeof incoming !== 'object') return;

        if (incoming.hopelogic_accounts !== undefined) {
            deliver(socket, 'message', { req_id: incoming.req_id, msg_type: 'hopelogic_accounts', hopelogic_accounts: options.getAccounts() });
            return;
        }
        if (typeof incoming.hopelogic_switch_account === 'string') {
            const loginid = incoming.hopelogic_switch_account.slice(0, 40);
            let ok = false;
            try { ok = await options.switchAccount(loginid); } catch { ok = false; }
            deliver(socket, 'message', { req_id: incoming.req_id, msg_type: 'hopelogic_switch_account', hopelogic_switch_account: { ok, loginid } });
            return;
        }
        if (incoming.forget_all !== undefined) {
            if (ALLOWED_FORGET_ALL.has(incoming.forget_all)) release(socket, incoming.forget_all);
            return;
        }
        if (incoming.forget !== undefined) {
            const key = [...streams.keys()].find(k => streams.get(k)?.id === String(incoming.forget));
            if (key) forgetStream(key);
            return;
        }
        await routeTradeCall(socket, incoming);
    };

    return {
        receive,
        dispose: () => {
            disposed = true;
            subscription.unsubscribe();
            for (const socket of clients) { deliver(socket, 'close'); release(socket); }
            clients.clear();
        },
    };
}
