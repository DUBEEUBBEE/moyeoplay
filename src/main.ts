import { AppShell } from './app/app-shell';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/games.css';
import './styles/responsive.css';
import './styles/clay-theme.css';
import './styles/clay-game-theme.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root was not found.');

const app = new AppShell(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.destroy());
}
