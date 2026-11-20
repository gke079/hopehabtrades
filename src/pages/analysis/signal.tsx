import React from 'react';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import './analysis.scss';

export default function Signal() {
    const { dashboard } = useStore();
    return <section className='digit-analysis digit-analysis--signal'>
        <header className='digit-analysis__header'><div><span className='digit-analysis__eyebrow'>SIGNAL WORKSPACE</span><h1>Signal</h1><p>A dedicated place for your market signals.</p></div></header>
        <div className='digit-analysis__panel digit-analysis__empty'><svg viewBox='0 0 64 48' width='64' height='48' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden='true'><path d='M2 26h12l8-18 12 32 9-22 6 8h13' /></svg><h2>No signal rules configured</h2><p>Live digit statistics are available in Analysis. This workspace has no active signal rules yet.</p><button onClick={() => dashboard.setActiveTab(DBOT_TABS.ANALYSIS)}>Open Analysis</button></div>
    </section>;
}
