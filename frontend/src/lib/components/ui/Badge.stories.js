import Badge from './Badge.svelte';

export default {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'error', 'info'],
      description: 'Visual style variant'
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Badge size'
    },
    rounded: {
      control: 'boolean',
      description: 'Rounded corners'
    },
    pill: {
      control: 'boolean',
      description: 'Pill shape'
    },
    dot: {
      control: 'boolean',
      description: 'Dot indicator'
    }
  }
};

export const Default = {
  args: {
    children: () => 'Default'
  }
};

export const Primary = {
  args: {
    variant: 'primary',
    children: () => 'Primary'
  }
};

export const Success = {
  args: {
    variant: 'success',
    children: () => 'Success'
  }
};

export const Warning = {
  args: {
    variant: 'warning',
    children: () => 'Warning'
  }
};

export const Error = {
  args: {
    variant: 'error',
    children: () => 'Error'
  }
};

export const Info = {
  args: {
    variant: 'info',
    children: () => 'Info'
  }
};

export const Small = {
  args: {
    size: 'sm',
    children: () => 'Small'
  }
};

export const Medium = {
  args: {
    size: 'md',
    children: () => 'Medium'
  }
};

export const Large = {
  args: {
    size: 'lg',
    children: () => 'Large'
  }
};

export const Pill = {
  args: {
    pill: true,
    variant: 'primary',
    children: () => 'Pill Badge'
  }
};

export const WithDot = {
  args: {
    dot: true,
    variant: 'success',
    children: () => 'Online'
  }
};

export const AllVariants = {
  render: () => ({
    Component: Badge,
    Template: `
      <div class="flex flex-wrap gap-2">
        <Badge variant="default">Default</Badge>
        <Badge variant="primary">Primary</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="error">Error</Badge>
        <Badge variant="info">Info</Badge>
      </div>
    `
  })
};
