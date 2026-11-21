import React, { Suspense, lazy } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';

const HopeLogic = lazy(() => import('@/pages/hopelogic/hopelogic'));

export default function Signal() {
    return (
        <Suspense fallback={<ChunkLoader message='Loading signals…' />}>
            <HopeLogic view='signals' />
        </Suspense>
    );
}
