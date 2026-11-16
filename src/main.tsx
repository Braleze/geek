import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __GEEK_REACT_MOUNTED__?: boolean;
  }
}

window.__GEEK_REACT_MOUNTED__ = true;
document.getElementById('geek-static-fallback-style')?.remove();

createRoot(document.getElementById('root')!).render(<App />);
