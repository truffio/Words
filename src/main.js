import './shell/style.css';
import { createApp } from './app.js';
import { startGame } from './game/main.js';

const game = startGame('game-container');
const app = createApp({ game, root: document.getElementById('app') });

// Test builds only (vite build --mode test); compiled out of production builds.
if (import.meta.env.MODE === 'test') {
  import('./test-bridge/bridge.js').then(({ installTestBridge }) => installTestBridge(app, game));
}
