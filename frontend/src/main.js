import { mount } from 'svelte';
import './app.css';
import './styles/accessibility.css';
// import App from './App.svelte';
import ComponentShowcase from './ComponentShowcase.svelte'; // Temporary: showcasing Tailwind components

const app = mount(ComponentShowcase, {
  target: document.getElementById('app')
});

export default app;
