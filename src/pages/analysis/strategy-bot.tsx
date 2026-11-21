import React, { Suspense, lazy } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';

const HopeLogic = lazy(() => import('@/pages/hopelogic/hopelogic'));

export default function StrategyBot() {
    return (
        <Suspense fallback={<ChunkLoader message='Loading Strategy Bot…' />}>
            <HopeLogic view='strategy' />
        </Suspense>
    );
}
