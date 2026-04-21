import './style.css';
import { GameEngine } from './game/engine';
import { CafeApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('找不到应用挂载节点 #app');
}

const engine = new GameEngine();
const app = new CafeApp(root, engine);

const tickHandle = window.setInterval(() => {
  engine.tick();
}, 100);

const saveOnBackground = (): void => {
  if (document.visibilityState === 'hidden') {
    engine.save(false);
  }
};

window.addEventListener('beforeunload', () => {
  engine.save(false);
});
document.addEventListener('visibilitychange', saveOnBackground);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.clearInterval(tickHandle);
    document.removeEventListener('visibilitychange', saveOnBackground);
    app.destroy();
  });
}
