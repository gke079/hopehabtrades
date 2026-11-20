import { analyzeDigits, lastDigit } from '../digit-analysis';

const ticks = (digits: number[]) => digits.map(digit => ({ digit }));
describe('digit analysis', () => {
    it('uses market precision including trailing zeroes', () => {
        expect(lastDigit(123.4, 2)).toBe(0);
        expect(lastDigit(123.45, 2)).toBe(5);
        expect(lastDigit(123, 0)).toBe(3);
        expect(() => lastDigit(NaN, 2)).toThrow();
    });
    it('calculates parity and strict barriers from the actual sample', () => {
        const result = analyzeDigits(ticks([0, 2, 5, 5, 7, 9]), 5);
        expect(result.total).toBe(6);
        expect(result.even).toBeCloseTo(100 / 3);
        expect(result.odd).toBeCloseTo(200 / 3);
        expect(result.over).toBeCloseTo(100 / 3);
        expect(result.under).toBeCloseTo(100 / 3);
        expect(result.equal).toBeCloseTo(100 / 3);
        expect(result.over + result.under + result.equal).toBeCloseTo(100);
    });
    it('ranks all four extremes distinctly, using digit order for ties', () => {
        const result = analyzeDigits(ticks([0, 0, 0, 2, 2, 1, 3, 4, 5, 6, 7]), 5);
        expect(result.ranks).toEqual({ 0: 'most', 2: 'second-most', 8: 'least', 9: 'second-least' });
        expect(Object.keys(result.ranks)).toHaveLength(4);
    });
    it('handles empty and equal samples without inventing rankings', () => {
        expect(analyzeDigits([], 5)).toMatchObject({ total: 0, even: 0, odd: 0, ranks: {} });
        expect(analyzeDigits(ticks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 5).ranks).toEqual({});
    });
    it('handles edge barriers with equal digits excluded', () => {
        const sample = ticks([0, 1, 9]);
        expect(analyzeDigits(sample, 0).under).toBe(0);
        expect(analyzeDigits(sample, 9).over).toBe(0);
    });
});
