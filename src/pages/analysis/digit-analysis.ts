export type MarketTick = { epoch: number; quote: number; digit: number };
export type DigitRank = 'most' | 'second-most' | 'least' | 'second-least';

export function lastDigit(quote: number, precision: number): number {
    if (!Number.isFinite(quote) || !Number.isInteger(precision) || precision < 0 || precision > 12) {
        throw new Error('Invalid quote precision');
    }
    return Number(quote.toFixed(precision).slice(-1));
}

export function analyzeDigits(ticks: Pick<MarketTick, 'digit'>[], barrier: number) {
    const counts = Array<number>(10).fill(0);
    ticks.forEach(({ digit }) => { if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit]++; });
    const total = counts.reduce((sum, count) => sum + count, 0);
    const percent = (count: number) => total ? count / total * 100 : 0;
    const digits = counts.map((count, digit) => ({ digit, count, percentage: percent(count) }));
    const ranks: Partial<Record<number, DigitRank>> = {};
    const high = [...digits].sort((a, b) => b.count - a.count || a.digit - b.digit);
    if (total && high[0].count !== high[9].count) {
        ranks[high[0].digit] = 'most';
        ranks[high[1].digit] = 'second-most';
        const low = [...digits].filter(item => !(item.digit in ranks)).sort((a, b) => a.count - b.count || a.digit - b.digit);
        ranks[low[0].digit] = 'least';
        ranks[low[1].digit] = 'second-least';
    }
    const sum = (predicate: (digit: number) => boolean) => counts.reduce((value, count, digit) => value + (predicate(digit) ? count : 0), 0);
    return {
        digits, ranks, total,
        even: percent(sum(d => d % 2 === 0)), odd: percent(sum(d => d % 2 !== 0)),
        over: percent(sum(d => d > barrier)), under: percent(sum(d => d < barrier)), equal: percent(counts[barrier] || 0),
    };
}
