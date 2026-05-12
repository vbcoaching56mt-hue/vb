import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import SignupPage from './pages/Signup';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
const isSignup = window.location.pathname === '/signup';

root.render(
  <React.StrictMode>
    {isSignup ? <SignupPage /> : <App />}
  </React.StrictMode>
);

reportWebVitals();
