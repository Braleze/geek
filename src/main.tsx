import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __GEEK_REACT_MOUNTED__?: boolean;
    __GEEK_OPEN_PREBETA_ON_MOUNT__?: boolean;
    __GEEK_STATIC_CLEANUP__?: () => void;
  }
}

window.__GEEK_REACT_MOUNTED__ = true;
window.__GEEK_STATIC_CLEANUP__?.();
document.getElementById('geek-static-fallback-style')?.remove();

createRoot(document.getElementById('root')!).render(<App />);
