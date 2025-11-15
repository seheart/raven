import { mount } from 'svelte';
import './app.css';
import './styles/accessibility.css';
import App from './NewApp.svelte'; // New Tailwind-based application

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
