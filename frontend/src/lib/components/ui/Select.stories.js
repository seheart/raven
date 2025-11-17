import Select from './Select.svelte';

export default {
  title: 'UI/Select',
  component: Select,
  tags: ['autodocs']
};

export const Default = {
  args: {
    options: ['Option 1', 'Option 2', 'Option 3'],
    placeholder: 'Choose an option...'
  }
};

export const WithLabel = {
  args: {
    label: 'Select Country',
    options: ['United States', 'Canada', 'Mexico', 'United Kingdom'],
    required: true
  }
};

export const WithObjectOptions = {
  args: {
    label: 'Select Size',
    options: [
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' }
    ]
  }
};

export const WithError = {
  args: {
    label: 'Payment Method',
    options: ['Credit Card', 'PayPal', 'Bank Transfer'],
    error: 'Please select a payment method'
  }
};

export const Disabled = {
  args: {
    label: 'Disabled Select',
    options: ['Option 1', 'Option 2'],
    disabled: true
  }
};
