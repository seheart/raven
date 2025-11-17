import Tabs from './Tabs.svelte';

export default {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs']
};

export const Default = {
  args: {
    tabs: [
      { id: 'tab1', label: 'Profile', content: 'Profile content goes here' },
      { id: 'tab2', label: 'Settings', content: 'Settings content goes here' },
      { id: 'tab3', label: 'Messages', content: 'Messages content goes here' }
    ]
  }
};

export const WithIcons = {
  args: {
    tabs: [
      { id: 'home', label: '🏠 Home', content: 'Home page content' },
      { id: 'profile', label: '👤 Profile', content: 'Profile information' },
      { id: 'settings', label: '⚙️ Settings', content: 'Settings panel' }
    ]
  }
};

export const ManyTabs = {
  args: {
    tabs: [
      { id: '1', label: 'Tab 1', content: 'Content 1' },
      { id: '2', label: 'Tab 2', content: 'Content 2' },
      { id: '3', label: 'Tab 3', content: 'Content 3' },
      { id: '4', label: 'Tab 4', content: 'Content 4' },
      { id: '5', label: 'Tab 5', content: 'Content 5' }
    ]
  }
};
