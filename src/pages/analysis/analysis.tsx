import React, { useMemo, useState } from 'react';
import { analyzeDigits } from './digit-analysis';
import { useDigitFeed } from './use-digit-feed';
import './analysis.scss';

const rankLabels = { most: 'Most appearing', 'second-most': 'Second most', least: 'Least appearing', 'second-least': 'Second least' };
const pct = (value: number, ready: boolean) => ready ? `${value.toFixed(1)}%` : '—';
export default function Analysis() {
    const [symbol, setSymbol] = useState('R_100');
    const [sampleSize, setSampleSize] = useState(1000);
    const [barrier, setBarrier] = useState(5);
    const [retry, setRetry] = useState(0);
    const { ticks, markets, precision, status, error } = useDigitFeed(symbol, retry);
    const sample = useMemo(() => ticks.slice(-sampleSize), [ticks, sampleSize]);
    const analysis = useMemo(() => analyzeDigits(sample, barrier), [sample, barrier]);
    const latest = sample[sample.length - 1];
    const ready = analysis.total > 0;
    const live = status === 'live';
    const pointerStyle = latest ? { '--digit': latest.digit, '--column': latest.digit % 5, '--row': Math.floor(latest.digit / 5) } as React.CSSProperties : undefined;
    return <section className='digit-analysis' aria-label='Live digit analysis'>
        <header className='digit-analysis__header'><div><span className='digit-analysis__eyebrow'>DERIV MARKET DATA</span><h1>Digit analysis</h1><p>A live view of the last digit of each market tick.</p></div><span className={`digit-analysis__status digit-analysis__status--${status}`} role='status'><i />{status === 'live' ? 'Live ticks' : status === 'error' ? 'Feed unavailable' : status === 'reconnecting' ? 'Reconnecting' : 'Connecting'}</span></header>
        <div className='digit-analysis__toolbar'>
            <label>Volatility<select value={symbol} onChange={e => setSymbol(e.target.value)}>{!markets.some(market => market.symbol === symbol) && <option value={symbol}>{symbol === 'R_100' ? 'Volatility 100 Index' : symbol}</option>}{markets.map(market => <option key={market.symbol} value={market.symbol}>{market.name}</option>)}</select></label>
            <label>Analysis window<select value={sampleSize} onChange={e => setSampleSize(Number(e.target.value))}><option value={100}>Last 100 ticks</option><option value={500}>Last 500 ticks</option><option value={1000}>Last 1,000 ticks</option></select></label>
            <div className='digit-analysis__quote'><span>Latest quote</span><strong>{latest && precision !== null ? latest.quote.toFixed(precision) : '—'}</strong></div>
            <div className='digit-analysis__sample'><span>Ticks in sample</span><strong>{analysis.total.toLocaleString()} <small>/ {sampleSize.toLocaleString()}</small></strong></div>
        </div>
        {error && <div className='digit-analysis__error' role='alert'>{error}<button onClick={() => setRetry(value => value + 1)}>Reconnect</button></div>}
        <div className='digit-analysis__panel'>
            <div className='digit-analysis__section-heading'><div><h2>Last-digit distribution</h2><p>Select a digit circle to set the over/under barrier.</p></div><span className='digit-analysis__barrier'>Barrier <b>{barrier}</b></span></div>
            <div className={`digit-analysis__circles ${!ready ? 'digit-analysis__circles--loading' : ''}`}>
                {latest && <div className='digit-analysis__pointer' style={pointerStyle} aria-hidden='true'><span /></div>}
                {analysis.digits.map(item => <button key={item.digit} className={`digit-analysis__digit ${analysis.ranks[item.digit] ? `digit-analysis__digit--${analysis.ranks[item.digit]}` : ''} ${barrier === item.digit ? 'digit-analysis__digit--selected' : ''}`} aria-pressed={barrier === item.digit} aria-label={`Digit ${item.digit}, ${pct(item.percentage, ready)}, ${analysis.ranks[item.digit] ? rankLabels[analysis.ranks[item.digit]] + ', ' : ''}select as barrier`} onClick={() => setBarrier(item.digit)}>
                    <span className='digit-analysis__ring'><svg viewBox='0 0 100 100' aria-hidden='true'><circle className='digit-analysis__track' cx='50' cy='50' r='43' /><circle className='digit-analysis__arc' cx='50' cy='50' r='43' pathLength='100' strokeDasharray='76 24' transform='rotate(133 50 50)' /></svg><strong>{item.digit}</strong></span>
                    <b>{pct(item.percentage, ready)}</b><small>{ready ? `${item.count} ticks` : 'Waiting'}</small>
                </button>)}
            </div>
            <div className='digit-analysis__legend'>{Object.entries(rankLabels).map(([rank, label]) => <span key={rank}><i className={`digit-analysis__swatch digit-analysis__swatch--${rank}`} />{label}</span>)}<span><i className='digit-analysis__pointer-key' />Latest digit {latest?.digit ?? '—'}</span></div>
            <p className='digit-analysis__note'>Rankings use the selected sample. Ties are ordered by digit, lowest first; equal distributions have no rank highlights.</p>
        </div>
        <div className='digit-analysis__breakdowns'>
            <article className='digit-analysis__panel'><span className='digit-analysis__eyebrow'>PARITY</span><h2>Even / Odd</h2><div className='digit-analysis__comparison'><div><span>Even</span><strong>{pct(analysis.even, ready)}</strong><small>0 · 2 · 4 · 6 · 8</small></div><div><span>Odd</span><strong>{pct(analysis.odd, ready)}</strong><small>1 · 3 · 5 · 7 · 9</small></div></div><div className='digit-analysis__meter' aria-hidden='true'><span style={{ flex: ready ? analysis.even : 1 }} /><span style={{ flex: ready ? analysis.odd : 1 }} /></div></article>
            <article className='digit-analysis__panel'><span className='digit-analysis__eyebrow'>BARRIER {barrier}</span><h2>Over / Under</h2><div className='digit-analysis__comparison'><div><span>Over {barrier}</span><strong>{pct(analysis.over, ready)}</strong><small>Digits greater than {barrier}</small></div><div><span>Under {barrier}</span><strong>{pct(analysis.under, ready)}</strong><small>Digits less than {barrier}</small></div></div><div className='digit-analysis__meter' aria-hidden='true'><span style={{ flex: ready ? analysis.over : 1 }} /><span className='digit-analysis__equal' style={{ flex: ready ? analysis.equal : 1 }} /><span style={{ flex: ready ? analysis.under : 1 }} /></div><p className='digit-analysis__note'>Equal to {barrier}: <b>{pct(analysis.equal, ready)}</b>. Equal digits count toward neither Over nor Under.</p></article>
        </div>
        <footer className='digit-analysis__footer'>{!live && ready ? 'Feed interrupted; showing the last received sample. ' : ''}These percentages describe past ticks, not the probability or outcome of the next trade.</footer>
    </section>;
}
