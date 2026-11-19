import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __GEEK_REACT_MOUNTED__?: boolean;
    __GEEK_OPEN_PREBETA_ON_MOUNT__?: boolean;
  }
}

window.__GEEK_REACT_MOUNTED__ = true;

createRoot(document.getElementById('root')!).render(<App />);
