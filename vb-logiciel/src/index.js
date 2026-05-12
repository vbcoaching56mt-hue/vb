import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import SignupPage from './pages/Signup';
import SetupOrganisationPage from './pages/SetupOrganisation';
import reportWebVitals from './reportWebVitals';

const path = window.location.pathname;

let PageComponent = App;
if (path === '/signup') PageComponent = SignupPage;
if (path === '/setup-organisation') PageComponent = SetupOrganisationPage;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PageComponent />
  </React.StrictMode>
);

reportWebVitals();
