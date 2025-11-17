import Checkbox from './Checkbox.svelte';

export default {
  title: 'UI/Checkbox',
  component: Checkbox,
  tags: ['autodocs']
};

export const Default = {
  args: {
    label: 'I agree to the terms and conditions'
  }
};

export const Checked = {
  args: {
    label: 'Subscribe to newsletter',
    checked: true
  }
};

export const Disabled = {
  args: {
    label: 'Disabled checkbox',
    disabled: true
  }
};

export const WithHelper = {
  args: {
    label: 'Enable notifications',
    helper: 'You will receive email updates'
  }
};

export const WithError = {
  args: {
    label: 'Accept privacy policy',
    error: 'You must accept the privacy policy'
  }
};
