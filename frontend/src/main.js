import { mount } from 'svelte';
import './app.css';
import './styles/accessibility.css';
import App from './NewApp.svelte';
import { setupGlobalErrorHandler } from './lib/errorLogger.js';

// Install global error tracking before mounting
setupGlobalErrorHandler();

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
