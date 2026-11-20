import React, { useState } from 'react';
import { Market, Tick } from '../types';
import { Market5mAnalysisSummary } from '../services/signalScannerEngine';
interface Props { ticks?: Tick[]; market: Market; defaultCollapsed?: boolean; defaultTimePeriod?: string; markets?: Market[]; onSelectMarket?: (market: Market) => void; analysis5m?: Market5mAnalysisSummary | null; }
export const ChartsView = ({ticks = [], market, defaultCollapsed = false, markets, onSelectMarket}: Props) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const sample = ticks.slice(-120);
    const low = Math.min(...sample.map(t => t.quote));
    const high = Math.max(...sample.map(t => t.quote));
    const range = high - low || 1;
    const points = sample.map((tick, i) => `${i / Math.max(sample.length-1, 1)*800},${175-(tick.quote-low)/range*150}`).join(' ');
    return <section className='rounded-2xl border border-slate-800 bg-[#111827] p-4'>
        <div className='flex justify-between items-center gap-3'><h2 className='text-sm font-bold'>Site price chart · {market.symbol}</h2><button className='text-xs text-slate-400 p-2' onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>{collapsed ? 'Show chart' : 'Hide chart'}</button></div>
        {markets && onSelectMarket && <select aria-label='Chart market' className='bg-slate-800 rounded p-2 my-2' value={market.id} onChange={e => {const next=markets.find(m => m.id===e.target.value); if(next) onSelectMarket(next);}}>{markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
        {!collapsed && (sample.length > 1 ? <><svg viewBox='0 0 800 200' className='w-full' role='img' aria-label={`${market.name}, last ${sample.length} site ticks`}><path d='M0 25H800M0 100H800M0 175H800' stroke='#263247' fill='none'/><polyline points={points} stroke='#63c9ac' strokeWidth='2' fill='none' vectorEffect='non-scaling-stroke'/></svg><p className='text-xs text-slate-400'>Last {sample.length} ticks · {sample[sample.length - 1]?.quoteFormatted}</p></> : <p className='py-12 text-center text-sm text-slate-400'>Waiting for site price history…</p>)}
    </section>;
};
