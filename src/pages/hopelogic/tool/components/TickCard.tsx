import React from 'react';
import { Market, Tick } from '../types';
export const TickCard = ({currentTick, market, isLiveFeed}: {currentTick: Tick | null; market: Market; isLiveFeed?: boolean; [key: string]: any}) => <section className='bg-[#111827] rounded-2xl border border-slate-800 p-5 flex items-center justify-between gap-4' aria-label='Current site price'>
    <div><p className='text-xs text-slate-400'>{market.name}</p><p className='text-xs mt-2 text-slate-400'>{isLiveFeed ? 'Live site tick' : 'Waiting for site ticks'}</p></div>
    <div className='text-right'><strong className='font-mono text-3xl text-white'>{currentTick ? <>{currentTick.quoteFormatted.slice(0,-1)}<span className='text-emerald-400'>{currentTick.lastDigit}</span></> : '—'}</strong><p className='text-xs text-slate-400 mt-2'>{currentTick ? new Date(currentTick.epoch).toLocaleTimeString() : 'No price received'}</p></div>
</section>;
