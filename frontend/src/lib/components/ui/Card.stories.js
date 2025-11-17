import Card from './Card.svelte';

export default {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outlined', 'elevated'],
      description: 'Visual style variant'
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
      description: 'Internal padding'
    },
    hover: {
      control: 'boolean',
      description: 'Hover effect'
    }
  }
};

export const Default = {
  args: {
    children: () => `
      <h3 class="text-lg font-semibold mb-2">Card Title</h3>
      <p class="text-sm">This is a default card with some content inside.</p>
    `
  }
};

export const Outlined = {
  args: {
    variant: 'outlined',
    children: () => `
      <h3 class="text-lg font-semibold mb-2">Outlined Card</h3>
      <p class="text-sm">This card has an outlined style.</p>
    `
  }
};

export const Elevated = {
  args: {
    variant: 'elevated',
    children: () => `
      <h3 class="text-lg font-semibold mb-2">Elevated Card</h3>
      <p class="text-sm">This card has elevation with shadow.</p>
    `
  }
};

export const WithHover = {
  args: {
    hover: true,
    children: () => `
      <h3 class="text-lg font-semibold mb-2">Hover Card</h3>
      <p class="text-sm">Hover over this card to see the effect.</p>
    `
  }
};

export const NoPadding = {
  args: {
    padding: 'none',
    children: () => `
      <div class="p-4 bg-[var(--surface-2)]">
        <h3 class="text-lg font-semibold mb-2">No Padding Card</h3>
        <p class="text-sm">This card has no internal padding.</p>
      </div>
    `
  }
};

export const LargePadding = {
  args: {
    padding: 'lg',
    children: () => `
      <h3 class="text-lg font-semibold mb-2">Large Padding</h3>
      <p class="text-sm">This card has large internal padding.</p>
    `
  }
};
