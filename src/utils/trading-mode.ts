export type TradingMode = 'fast' | 'normal';
let selectedMode: TradingMode = 'fast';
export const getTradingMode = () => selectedMode;
export const setTradingMode = (mode: TradingMode) => { selectedMode = mode; };

// Counts distinct market ticks, never wall-clock time. The first entry is immediate.
export class EntrySpacing {
    private lastEpoch: number | undefined;
    private skipNext = false;
    constructor(private mode: TradingMode) {}
    onSettlement() { this.skipNext = this.mode === 'normal'; }
    allowsTick(epoch: number) {
        if (this.lastEpoch !== undefined && epoch <= this.lastEpoch) return false;
        this.lastEpoch = epoch;
        if (this.skipNext) { this.skipNext = false; return false; }
        return true;
    }
}
