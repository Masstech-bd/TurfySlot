import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import type { TurfMapProps } from './TurfMap';

const InteractiveTurfMap = lazy(() => import('./TurfMap').then((module) => ({ default: module.TurfMap })));

class TurfMapErrorBoundary extends Component<
  { children: ReactNode; className?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error('Interactive turf map failed to load:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={this.props.className} role="status">
          Map could not be displayed. You can still continue.
        </div>
      );
    }
    return this.props.children;
  }
}

export const TurfMap = (props: TurfMapProps) => (
  <TurfMapErrorBoundary className={props.className}>
    <Suspense fallback={<div className={props.className} aria-label="Loading map" />}>
      <InteractiveTurfMap {...props} />
    </Suspense>
  </TurfMapErrorBoundary>
);