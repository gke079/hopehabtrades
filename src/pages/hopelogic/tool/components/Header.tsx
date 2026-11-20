import React from 'react';
export const Header = (props: any) => <header className='sticky top-0 z-30 bg-[#080d16] border-b border-slate-800 px-4 py-4'>
    <div className='max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3'>
        <div><h1 className='text-xl font-bold text-white'>HopeLogic</h1><p className='text-xs text-slate-400'>Market analysis & strategy practice</p></div>
        <div className='flex flex-wrap items-center gap-3 text-xs'>
            <span role='status' className={props.connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-300'}>{props.connectionStatus === 'connected' ? 'Site feed connected' : 'Waiting for site feed'}</span>
            <button className='rounded-lg border border-slate-700 px-3 py-2' onClick={props.onToggleSound}>{props.soundEnabled ? 'Mute' : 'Sound'}</button>
            <button className='rounded-lg border border-slate-700 px-3 py-2' onClick={props.onToggleTheme}>{props.theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
        </div>
    </div>
    <p className='max-w-4xl mx-auto mt-3 text-xs text-amber-200'>Live site prices · Simulated trades and practice balance only · Settings apply for this session. Export XML to keep a strategy.</p>
</header>;
