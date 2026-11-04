import React from 'react';
import soccerBallUrl from '../../assets/images/soccer-ball-twemoji.svg';

export const StartupLoadingScreen: React.FC = () => (
  <main className="startup-loader flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
    <div aria-hidden="true" className="startup-loader__kick grid h-16 w-16 place-items-center">
      <img className="startup-loader__ball h-8 w-8 sm:h-9 sm:w-9" src={soccerBallUrl} alt="" draggable="false" />
    </div>
  </main>
);
