import { createMarketBridge } from '../market-bridge';

function setup() {
    let publish: (event: any) => void;
    const unsubscribe = jest.fn();
    const send = jest.fn(async (request: any) => request.forget ? {} : {
        msg_type: 'history', pip_size: 3,
        history: { prices: [123.45], times: [100] },
        subscription: {id: 'hope-stream'},
        echo_req: {private_field: 'must stay in host'},
    });
    const api = {send, onMessage: () => ({subscribe: (callback: any) => {publish = callback; return {unsubscribe};}})};
    const deliver = jest.fn();
    const bridge = createMarketBridge(api, deliver);
    return {bridge, send, deliver, unsubscribe, publish: (data: any) => publish({data})};
}
const request = JSON.stringify({ticks_history: 'R_100', style: 'ticks', subscribe: 1});

it('shares one site stream and forwards precise public prices without unrelated responses', async () => {
    const {bridge, send, deliver, publish} = setup();
    await bridge.receive('digits', 'open'); await bridge.receive('scanner', 'open');
    await bridge.receive('digits', 'send', request); await bridge.receive('scanner', 'send', request);
    expect(send).toHaveBeenCalledTimes(1);
    const initial = deliver.mock.calls.find(call => call[1] === 'message')?.[2];
    expect(initial.history.prices).toEqual([123.45]); expect(initial.pip_size).toBe(3);
    expect(initial.echo_req.private_field).toBeUndefined();
    deliver.mockClear();
    publish({msg_type: 'balance', balance: {balance: 123}});
    expect(deliver).not.toHaveBeenCalled();
    publish({tick: {symbol: 'R_100', quote: 123.46, epoch: 101, pip_size: 3}, private_field: 'must stay in host'});
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls[0][2].tick.quote).toBe(123.46);
    expect(deliver.mock.calls[0][2].private_field).toBeUndefined();
    bridge.dispose();
});

it('replays up-to-date history and releases only owned subscriptions after the final reader leaves', async () => {
    const {bridge, send, deliver, publish, unsubscribe} = setup();
    await bridge.receive('a', 'open'); await bridge.receive('a', 'send', request);
    publish({tick: {symbol: 'R_100', quote: 123.47, epoch: 101, pip_size: 3}});
    await bridge.receive('b', 'open'); await bridge.receive('b', 'send', request);
    expect(deliver.mock.calls.filter(call => call[0] === 'b' && call[1] === 'message')[0][2].history.prices).toEqual([123.45, 123.47]);
    await bridge.receive('a', 'close'); expect(send).toHaveBeenCalledTimes(1);
    await bridge.receive('b', 'close'); expect(send).toHaveBeenLastCalledWith({forget: 'hope-stream'});
    bridge.dispose(); expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('rejects trading, authentication, arbitrary forget requests, and malformed input', async () => {
    const {bridge, send} = setup();
    await bridge.receive('a', 'open');
    for (const data of [{buy: 'proposal'}, {authorize: 'not-a-credential'}, {forget_all: 'ticks'}, {ticks_history: 'R_100', style: 'candles', granularity: -1}, null]) {
        await bridge.receive('a', 'send', JSON.stringify(data));
    }
    await bridge.receive('a', 'send', '{bad json');
    expect(send).not.toHaveBeenCalled();
    bridge.dispose();
});

it('shares a site-owned live stream when already subscribed without forgetting it', async () => {
    const {bridge, send, publish, deliver} = setup();
    send.mockRejectedValueOnce({error: {code: 'AlreadySubscribed'}});
    send.mockResolvedValueOnce({history: {prices: [123.45], times: [100]}, pip_size: 3} as any);
    await bridge.receive('a', 'open'); await bridge.receive('a', 'send', request);
    expect(send.mock.calls[1][0].subscribe).toBeUndefined();
    publish({tick: {symbol: 'R_100', quote: 123.48, epoch: 101, pip_size: 3}});
    expect(deliver.mock.calls.some(call => call[2]?.tick?.quote === 123.48)).toBe(true);
    bridge.dispose(); expect(send).toHaveBeenCalledTimes(2);
});

it('cleans up a subscription whose initial response arrives after disposal', async () => {
    const {bridge, send, deliver} = setup();
    let finish: (value: any) => void;
    send.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    await bridge.receive('a', 'open');
    const pending = bridge.receive('a', 'send', request);
    await Promise.resolve(); bridge.dispose();
    finish!({history: {prices: [1], times: [1]}, subscription: {id: 'late-stream'}});
    await pending;
    expect(send).toHaveBeenLastCalledWith({forget: 'late-stream'});
    expect(deliver.mock.calls.some(call => call[1] === 'message')).toBe(false);
});
