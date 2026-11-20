import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';
const root = document.getElementById('root')!;
if (window.parent === window) {
    root.textContent = 'Open the HopeLogic tab on the main site to use its live market feed.';
} else {
    createRoot(root).render(<App />);
    window.parent.postMessage({channel: 'hopelogic-market-v1', event: 'ready'}, window.location.origin);
}
