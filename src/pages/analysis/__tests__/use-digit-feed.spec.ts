import { act, renderHook } from '@testing-library/react';
import { useDigitFeed } from '../use-digit-feed';

jest.mock('../../../components/shared/utils/config/config', () => ({
    WS_SERVERS: { PRODUCTION: 'wss://feed.example/public', STAGING: 'wss://staging.example/public' },
    isProduction: () => true,
}));

class MockSocket {
    static OPEN = 1;
    static sockets: MockSocket[] = [];
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
    onerror?: () => void;
    send = jest.fn();
    close = jest.fn(() => { this.readyState = 3; this.onclose?.(); });
    constructor(_url: string) { MockSocket.sockets.push(this); }
    emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
const originalSocket = global.WebSocket;
beforeEach(() => {
    jest.useFakeTimers();
    MockSocket.sockets = [];
    global.WebSocket = MockSocket as unknown as typeof WebSocket;
});
afterEach(() => { global.WebSocket = originalSocket; jest.useRealTimers(); });

it('preserves precision, deduplicates history and ignores a replaced market feed', () => {
    const { result, rerender, unmount } = renderHook(({ symbol }) => useDigitFeed(symbol, 0), { initialProps: { symbol: 'R_100' } });
    const first = MockSocket.sockets[0];
    act(() => {
        first.onopen?.();
        first.emit({ pip_size: 2, history: { times: [10, 11], prices: [123.4, 123.45] } });
        first.emit({ tick: { epoch: 11, quote: 123.45, pip_size: 2, symbol: 'R_100' } });
    });
    expect(result.current.ticks.map(tick => tick.digit)).toEqual([0, 5]);
    expect(result.current.status).toBe('live');
    rerender({ symbol: 'R_10' });
    expect(first.close).toHaveBeenCalled();
    act(() => first.emit({ tick: { epoch: 12, quote: 123.49, pip_size: 2, symbol: 'R_100' } }));
    expect(result.current.ticks).toEqual([]);
    const second = MockSocket.sockets[1];
    act(() => {
        second.onopen?.();
        second.emit({ pip_size: 3, history: { times: [20], prices: [85.12] } });
    });
    expect(result.current.ticks[0].digit).toBe(0);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
});

it('reconnects after a disconnect and requests a fresh rolling sample', () => {
    const { result, unmount } = renderHook(() => useDigitFeed('R_100', 0));
    const first = MockSocket.sockets[0];
    act(() => { first.onopen?.(); first.close(); });
    expect(result.current.status).toBe('reconnecting');
    act(() => jest.advanceTimersByTime(1000));
    const second = MockSocket.sockets[1];
    act(() => second.onopen?.());
    expect(second.send).toHaveBeenCalledWith(expect.stringContaining('"ticks_history":"R_100"'));
    act(() => second.emit({ history: { times: [20], prices: [123.4] } }));
    expect(result.current.ticks).toEqual([]);
    act(() => second.emit({ tick: { epoch: 21, quote: 123.41, pip_size: 2, symbol: 'R_100' } }));
    expect(result.current.ticks.map(tick => tick.digit)).toEqual([0, 1]);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
});
