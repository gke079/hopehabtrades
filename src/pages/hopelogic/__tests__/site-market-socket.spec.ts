import {SiteMarketSocket} from '../tool/site-market-socket';

it('accepts parent market messages only from the current origin and removes listeners on close', () => {
    jest.useFakeTimers();
    const socket = new SiteMarketSocket();
    const id = (socket as any).id;
    const open = jest.fn(); const message = jest.fn(); const close = jest.fn();
    socket.onopen = open; socket.onmessage = message; socket.onclose = close;
    const dispatch = (event: string, origin = window.location.origin, source: any = window.parent) => window.dispatchEvent(new MessageEvent('message', {origin, source, data: {channel: 'hopelogic-market-v1', socket: id, event, data: {tick: {quote: 123.45}}}}));
    dispatch('open', 'https://unrelated.example'); expect(open).not.toHaveBeenCalled();
    dispatch('open'); expect(open).toHaveBeenCalledTimes(1);
    dispatch('message'); expect(JSON.parse(message.mock.calls[0][0].data).tick.quote).toBe(123.45);
    socket.close(); dispatch('message');
    expect(message).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
});
