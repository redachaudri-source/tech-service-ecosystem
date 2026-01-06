import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Global Error Handler for "White Screen" on startup
window.onerror = function (message, source, lineno, colno, error) {
    const root = document.getElementById('root');
    if (root && root.innerHTML === '') { // Only if nothing rendered yet
        const errorDiv = document.createElement('div');
        errorDiv.style.padding = '20px';
        errorDiv.style.color = 'red';
        errorDiv.style.fontFamily = 'monospace';
        errorDiv.style.backgroundColor = '#fff0f0';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100vw';
        errorDiv.style.height = '100vh';
        errorDiv.style.zIndex = '99999';
        errorDiv.style.overflow = 'auto';
        errorDiv.innerHTML = `
            <h3>Startup Error</h3>
            <p>${message}</p>
            <p>Source: ${source}:${lineno}</p>
        `;
        document.body.appendChild(errorDiv);
        console.error("Global Error Caught:", error);
    }
};

ReactDOM.createRoot(document.getElementById('root')).render(

    <React.StrictMode>
        <App />
    </React.StrictMode>,
)



