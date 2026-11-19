import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __GEEK_REACT_MOUNTED__?: boolean;
    __GEEK_OPEN_PREBETA_ON_MOUNT__?: boolean;
  }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            maxWidth: 560,
            margin: '72px auto',
            padding: 24,
            border: '1px solid rgba(255,42,133,0.4)',
            borderRadius: 14,
            background: '#0f0b1d',
            fontFamily: 'system-ui, sans-serif',
            color: '#e2e8f0',
            lineHeight: 1.55,
          }}
        >
          <h1 style={{ margin: '0 0 10px', fontSize: 19, color: '#00f0ff' }}>
            Geek — Ошибка отображения интерфейса
          </h1>
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>
            Во время запуска интерфейса произошла ошибка. Попробуйте обновить страницу (Ctrl+F5).
          </p>
          <pre
            style={{
              margin: '0 0 14px',
              padding: '8px 10px',
              borderRadius: 8,
              background: '#050814',
              border: '1px solid rgba(255,42,133,0.35)',
              color: '#ff80a0',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #00f0ff',
              background: 'rgba(0,240,255,0.15)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>,
  );
  window.__GEEK_REACT_MOUNTED__ = true;
}

