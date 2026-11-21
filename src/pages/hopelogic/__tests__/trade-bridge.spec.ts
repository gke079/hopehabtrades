import { createTradeBridge, TradeAccountLite } from '../trade-bridge';

function setup() {
    let publish: (event: any) => void;
    const unsubscribe = jest.fn();
    const send = jest.fn(async (request: any) => {
        if (request.forget) return {};
        if (request.balance) return { msg_type: 'balance', balance: { balance: 125.5, currency: 'USD', loginid: 'VRTC1', secret_field: 'x' }, subscription: { id: 'bal-stream' }, echo_req: { private_field: 'host-only' } };
        if (request.proposal) return { msg_type: 'proposal', proposal: { id: 'prop-1', ask_price: 0.35, payout: 0.67, internal: 'hide' }, echo_req: { private_field: 'host-only' } };
        if (request.buy) return { msg_type: 'buy', buy: { contract_id: 123, buy_price: 0.35, payout: 0.67, token: 'secret' }, echo_req: { private_field: 'host-only' } };
        if (request.proposal_open_contract) return { msg_type: 'proposal_open_contract', proposal_open_contract: { contract_id: request.contract_id, status: 'open', profit: 0 }, subscription: { id: `poc-${request.contract_id}` }, echo_req: { private_field: 'host-only' } };
        return {};
    });
    const api = { send, onMessage: () => ({ subscribe: (callback: any) => { publish = callback; return { unsubscribe }; } }) };
    const accounts: TradeAccountLite[] = [
        { loginid: 'VRTC1', currency: 'USD', balance: 125.5, is_virtual: true },
        { loginid: 'CR900', currency: 'USD', balance: 40, is_virtual: false },
    ];
    const switchAccount = jest.fn(async (loginid: string) => loginid === 'CR900');
    const deliver = jest.fn();
    const bridge = createTradeBridge(api, deliver, { getAccounts: () => ({ accounts, current: accounts[0] }), switchAccount });
    const receive = (socket: string, data: any) => bridge.receive(socket, 'send', typeof data === 'string' ? data : JSON.stringify(data));
    return { bridge, send, deliver, switchAccount, receive, publish: (data: any) => publish({ data }), open: async (socket: string) => bridge.receive(socket, 'open') };
}

it('exposes account list and switching without credentials', async () => {
    const { bridge, receive, deliver, switchAccount, open } = setup();
    await open('a');
    await receive('a', { hopelogic_accounts: 1 });
    await receive('a', { hopelogic_switch_account: 'CR900' });
    await receive('a', { hopelogic_switch_account: 'HACK1' });
    const replies = deliver.mock.calls.filter(c => c[1] === 'message');
    expect(replies[0][2].hopelogic_accounts.accounts[1].loginid).toBe('CR900');
    expect(replies[1][2].hopelogic_switch_account.ok).toBe(true);
    expect(replies[2][2].hopelogic_switch_account.ok).toBe(false);
    expect(switchAccount).toHaveBeenCalledWith('CR900');
    expect(JSON.stringify(replies)).not.toMatch(/token|secret/i);
    bridge.dispose();
});

it('executes proposal and buy calls and sanitizes replies', async () => {
    const { bridge, receive, deliver, open } = setup();
    await open('a');
    await receive('a', { proposal: 1, amount: 0.35, basis: 'stake', contract_type: 'DIGITOVER', currency: 'USD', duration: 1, duration_unit: 't', symbol: 'R_100', barrier: '3' });
    await receive('a', { buy: 'prop-1', price: 0.35 });
    const replies = deliver.mock.calls.filter(c => c[1] === 'message');
    expect(replies[0][2].proposal.id).toBe('prop-1');
    expect(replies[0][2].proposal.internal).toBeUndefined();
    expect(replies[1][2].buy.contract_id).toBe(123);
    expect(replies[1][2].buy.token).toBeUndefined();
    bridge.dispose();
});

it('rejects malformed, oversized and non-whitelisted trade input', async () => {
    const { bridge, receive, send, open } = setup();
    await open('a');
    for (const data of [
        { proposal: 1, amount: -1, basis: 'stake', contract_type: 'DIGITOVER', duration: 1, duration_unit: 't', symbol: 'R_100' },
        { proposal: 1, amount: 1, basis: 'stake', contract_type: 'DIGITOVER; DROP', duration: 1, duration_unit: 't', symbol: 'R_100' },
        { proposal: 1, amount: 1, basis: 'stake', contract_type: 'DIGITOVER', duration: 5000, duration_unit: 't', symbol: 'R_100' },
        { authorize: 'steal-token' },
        { transaction: 1 },
        { forget: 'unknown-stream' },
        { forget_all: 'ticks' },
        'x'.repeat(4000),
    ]) {
        await bridge.receive('a', 'send', typeof data === 'string' ? data : JSON.stringify(data));
    }
    expect(send).not.toHaveBeenCalled();
    bridge.dispose();
});

it('streams balance and contract settlement updates to subscribers', async () => {
    const { bridge, receive, deliver, open, publish } = setup();
    await open('a');
    await receive('a', { balance: 1, subscribe: 1 });
    await receive('a', { proposal_open_contract: 1, contract_id: 123, subscribe: 1 });
    publish({ msg_type: 'balance', balance: { balance: 130, currency: 'USD', loginid: 'VRTC1' }, subscription: { id: 'bal-stream' } });
    publish({ msg_type: 'proposal_open_contract', proposal_open_contract: { contract_id: 123, status: 'won', profit: 0.32, is_sold: 1 }, subscription: { id: 'poc-123' } });
    publish({ msg_type: 'proposal_open_contract', proposal_open_contract: { contract_id: 999, status: 'won', profit: 5, is_sold: 1 }, subscription: { id: 'poc-999' } });
    const messages = deliver.mock.calls.filter(c => c[1] === 'message').map(c => c[2]);
    const balanceUpdates = messages.filter(m => m.msg_type === 'balance');
    expect(balanceUpdates.some(m => m.balance.balance === 130)).toBe(true);
    expect(balanceUpdates[0].balance.secret_field).toBeUndefined();
    const settlement = messages.filter(m => m.msg_type === 'proposal_open_contract');
    expect(settlement.some(m => m.proposal_open_contract.contract_id === 123)).toBe(true);
    expect(settlement.some(m => m.proposal_open_contract.contract_id === 999)).toBe(false);
    bridge.dispose();
});

it('releases owned streams when a socket disconnects', async () => {
    const { bridge, receive, send, open } = setup();
    await open('a');
    await receive('a', { balance: 1, subscribe: 1 });
    expect(send).toHaveBeenCalledWith({ balance: 1, subscribe: 1 });
    await bridge.receive('a', 'close');
    expect(send).toHaveBeenLastCalledWith({ forget: 'bal-stream' });
    bridge.dispose();
});
