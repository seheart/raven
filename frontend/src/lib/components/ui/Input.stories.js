import Input from './Input.svelte';

export default {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'url', 'tel'],
      description: 'Input type'
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Input size'
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state'
    },
    required: {
      control: 'boolean',
      description: 'Required field'
    },
    readonly: {
      control: 'boolean',
      description: 'Read-only state'
    }
  }
};

export const Default = {
  args: {
    placeholder: 'Enter text...'
  }
};

export const WithLabel = {
  args: {
    label: 'Email Address',
    placeholder: 'your@email.com',
    type: 'email'
  }
};

export const WithHelper = {
  args: {
    label: 'Username',
    placeholder: 'johndoe',
    helper: 'Choose a unique username'
  }
};

export const WithError = {
  args: {
    label: 'Password',
    type: 'password',
    error: 'Password must be at least 8 characters'
  }
};

export const Required = {
  args: {
    label: 'Full Name',
    placeholder: 'John Doe',
    required: true
  }
};

export const WithIcon = {
  args: {
    label: 'Search',
    placeholder: 'Search...',
    icon: '🔍',
    type: 'search'
  }
};

export const Disabled = {
  args: {
    label: 'Disabled Input',
    value: 'Cannot edit this',
    disabled: true
  }
};

export const ReadOnly = {
  args: {
    label: 'Read Only',
    value: 'This is read-only',
    readonly: true
  }
};

export const NumberInput = {
  args: {
    label: 'Age',
    type: 'number',
    min: 0,
    max: 120,
    placeholder: '25'
  }
};

export const Small = {
  args: {
    size: 'sm',
    placeholder: 'Small input'
  }
};

export const Large = {
  args: {
    size: 'lg',
    placeholder: 'Large input'
  }
};
