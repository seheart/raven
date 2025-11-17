import Button from './Button.svelte';

export default {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'success'],
      description: 'Visual style variant',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'primary' }
      }
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Button size',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'md' }
      }
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: false }
      }
    },
    type: {
      control: 'select',
      options: ['button', 'submit', 'reset'],
      description: 'HTML button type',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'button' }
      }
    }
  }
};

// Default button
export const Primary = {
  args: {
    variant: 'primary',
    children: () => 'Primary Button'
  }
};

// All variants
export const Secondary = {
  args: {
    variant: 'secondary',
    children: () => 'Secondary Button'
  }
};

export const Ghost = {
  args: {
    variant: 'ghost',
    children: () => 'Ghost Button'
  }
};

export const Danger = {
  args: {
    variant: 'danger',
    children: () => 'Danger Button'
  }
};

export const Success = {
  args: {
    variant: 'success',
    children: () => 'Success Button'
  }
};

// All sizes
export const Small = {
  args: {
    size: 'sm',
    children: () => 'Small Button'
  }
};

export const Medium = {
  args: {
    size: 'md',
    children: () => 'Medium Button'
  }
};

export const Large = {
  args: {
    size: 'lg',
    children: () => 'Large Button'
  }
};

// States
export const Disabled = {
  args: {
    disabled: true,
    children: () => 'Disabled Button'
  }
};

// Interactive example
export const Playground = {
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    type: 'button',
    children: () => 'Click Me!',
    onclick: () => alert('Button clicked!')
  }
};
