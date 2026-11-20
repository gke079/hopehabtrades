import { EntrySpacing } from '../trading-mode';

describe('entry spacing', () => {
    it('allows every distinct tick in fast mode, including after settlement', () => {
        const spacing = new EntrySpacing('fast');
        expect(spacing.allowsTick(100)).toBe(true);
        spacing.onSettlement();
        expect(spacing.allowsTick(101)).toBe(true);
        expect(spacing.allowsTick(102)).toBe(true);
    });
    it('skips exactly one distinct tick after each settlement in normal mode', () => {
        const spacing = new EntrySpacing('normal');
        expect(spacing.allowsTick(100)).toBe(true);
        spacing.onSettlement();
        expect(spacing.allowsTick(100)).toBe(false);
        expect(spacing.allowsTick(101)).toBe(false);
        expect(spacing.allowsTick(101)).toBe(false);
        expect(spacing.allowsTick(102)).toBe(true);
        spacing.onSettlement();
        expect(spacing.allowsTick(104)).toBe(false);
        expect(spacing.allowsTick(110)).toBe(true);
    });
    it('does not carry skipped ticks into a new run', () => {
        const oldRun = new EntrySpacing('normal');
        oldRun.onSettlement();
        expect(new EntrySpacing('normal').allowsTick(100)).toBe(true);
    });
});
