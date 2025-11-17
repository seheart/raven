import Toggle from './Toggle.svelte';

export default {
  title: 'UI/Toggle',
  component: Toggle,
  tags: ['autodocs']
};

export const Default = {
  args: {
    label: 'Enable dark mode'
  }
};

export const Enabled = {
  args: {
    label: 'Notifications',
    enabled: true
  }
};

export const Disabled = {
  args: {
    label: 'Disabled toggle',
    disabled: true
  }
};

export const Small = {
  args: {
    label: 'Small toggle',
    size: 'sm'
  }
};

export const Large = {
  args: {
    label: 'Large toggle',
    size: 'lg'
  }
};
