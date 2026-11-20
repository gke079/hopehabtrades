let nextSocket = 0;
const CHANNEL = 'hopelogic-market-v1';
// A WebSocket-shaped reader backed by the parent site's market connection.
// It cannot open a network socket or access the site's account credentials.
export class SiteMarketSocket {
    readyState: number = WebSocket.CONNECTING;
    onopen: ((event?: any) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: any) => void) | null = null;
    onerror: ((event?: any) => void) | null = null;
    private id = `hopelogic-${Date.now()}-${++nextSocket}`;
    private timeout: ReturnType<typeof setInterval>;
    constructor(_unusedEndpoint?: string) {
        window.addEventListener('message', this.receive);
        this.post('open');
        this.timeout = setInterval(() => { if (this.readyState === WebSocket.CONNECTING) this.post('open'); }, 1000);
    }
    private post(event: string, data?: string) {
        if (window.parent !== window) window.parent.postMessage({channel: CHANNEL, socket: this.id, event, data}, window.location.origin);
    }
    private receive = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== CHANNEL || event.data.socket !== this.id) return;
        const {event: type, data} = event.data;
        if (type === 'open' && this.readyState === WebSocket.CONNECTING) { this.readyState = WebSocket.OPEN; clearInterval(this.timeout); this.onopen?.({}); }
        if (type === 'message' && this.readyState === WebSocket.OPEN) this.onmessage?.({data: JSON.stringify(data)} as MessageEvent);
        if (type === 'close') this.close();
    };
    send(data: string) { if (this.readyState === WebSocket.OPEN) this.post('send', data); }
    close() {
        if (this.readyState === WebSocket.CLOSED) return;
        this.readyState = WebSocket.CLOSED;
        clearInterval(this.timeout); window.removeEventListener('message', this.receive); this.post('close');
        this.onclose?.({code: 1000, reason: 'Site feed disconnected'});
    }
}
