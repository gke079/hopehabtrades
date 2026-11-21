import React from 'react';
import { LiveAccountInfo } from '../services/liveTrade';

export const Header = (props: any) => {
    const accounts: LiveAccountInfo[] = props.liveAccounts ?? [];
    const active: LiveAccountInfo | null = props.activeLiveAccount ?? null;
    const liveReady = accounts.length > 0 && Boolean(active);
    const activeIsReal = active ? !active.isVirtual : false;

    return (
    <header className='sticky top-0 z-30 bg-[#080d16] border-b border-slate-800 px-4 py-4'>
        <div className='max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3'>
            <div><h1 className='text-xl font-bold text-white'>{props.signalsOnly ? 'Signals' : 'HopeLogic'}</h1><p className='text-xs text-slate-400'>{props.signalsOnly ? 'Live market signals · trades on your Deriv account' : 'Market analysis & strategy trading'}</p></div>
            <div className='flex flex-wrap items-center gap-3 text-xs'>
                <span role='status' className={props.connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-300'}>{props.connectionStatus === 'connected' ? 'Site feed connected' : 'Waiting for site feed'}</span>
                <button className='rounded-lg border border-slate-700 px-3 py-2' onClick={props.onToggleSound}>{props.soundEnabled ? 'Mute' : 'Sound'}</button>
                <button className='rounded-lg border border-slate-700 px-3 py-2' onClick={props.onToggleTheme}>{props.theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
            </div>
        </div>
        <div className='max-w-4xl mx-auto mt-3 flex flex-wrap items-center gap-2 text-xs'>
            <button
                type='button'
                disabled={!liveReady}
                onClick={props.onToggleLiveTrading}
                title={!liveReady ? 'Log in on the main site to trade your Deriv account' : props.liveTradingEnabled ? 'Switch back to simulation' : 'Trade with your Deriv account'}
                className={`rounded-lg px-3 py-2 font-bold border transition-colors ${
                    props.liveTradingEnabled
                        ? activeIsReal
                            ? 'bg-red-500/20 border-red-500 text-red-300'
                            : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : liveReady
                        ? 'border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-emerald-300'
                        : 'border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
            >
                {props.liveTradingEnabled
                    ? activeIsReal ? '● LIVE · Real account' : '● LIVE · Demo account'
                    : 'Simulation mode'}
            </button>
            {liveReady && (
                <select
                    aria-label='Trading account'
                    value={active?.loginid ?? ''}
                    onChange={(e) => props.onSwitchLiveAccount?.(e.target.value)}
                    className='rounded-lg border border-slate-700 bg-[#080d16] px-2 py-2 text-slate-200'
                >
                    {accounts.map((account) => (
                        <option key={account.loginid} value={account.loginid}>
                            {account.isVirtual ? 'Demo' : 'Real'} · {account.loginid} · {account.currency} {account.balance.toFixed(2)}
                        </option>
                    ))}
                </select>
            )}
            {!liveReady && <span className='text-slate-500'>Log in on the main site to trade your real or demo Deriv account</span>}
        </div>
        <p className='max-w-4xl mx-auto mt-3 text-xs text-amber-200'>
            {props.liveTradingEnabled
                ? `LIVE MODE · Real contracts are placed on your ${activeIsReal ? 'REAL' : 'DEMO'} Deriv account (${active?.currency} ${active ? active.balance.toFixed(2) : '—'}) and settle with Deriv's actual payouts.`
                : 'Live site prices · Simulated trades and practice balance only · Enable Live mode to trade your Deriv account.'}
            {' '}Settings apply for this session. Export XML to keep a strategy.
        </p>
    </header>
    );
};
