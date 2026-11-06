import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { applyThemeTokens } from './ui/tokens';
import './ui/style.css';

applyThemeTokens();

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
