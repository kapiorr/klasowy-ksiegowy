import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Zablokowany from './pages/Zablokowany.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './index.css';

async function init() {
  try {
    const res = await fetch('/api/check-ip');
    const data = await res.json();
    if (data.blocked) {
      ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
          <ThemeProvider><Zablokowany /></ThemeProvider>
        </React.StrictMode>
      );
      return;
    }
  } catch {}

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ThemeProvider><App /></ThemeProvider>
    </React.StrictMode>
  );
}

init();
