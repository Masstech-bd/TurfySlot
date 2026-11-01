import { lazy, Suspense } from 'react';
import type { TurfMapProps } from './TurfMap';

const InteractiveTurfMap = lazy(() => import('./TurfMap').then((module) => ({ default: module.TurfMap })));

export const TurfMap = (props: TurfMapProps) => (
  <Suspense fallback={<div className={props.className} aria-label="Loading map" />}>
    <InteractiveTurfMap {...props} />
  </Suspense>
);