import Modal from './Modal.svelte';

export default {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs']
};

export const Default = {
  args: {
    open: true,
    title: 'Modal Title',
    children: () => 'This is the modal content.'
  }
};

export const WithFooter = {
  args: {
    open: true,
    title: 'Confirm Action',
    children: () => 'Are you sure you want to proceed?',
    footer: () => `
      <Button variant="secondary">Cancel</Button>
      <Button variant="primary">Confirm</Button>
    `
  }
};

export const Small = {
  args: {
    open: true,
    title: 'Small Modal',
    size: 'sm',
    children: () => 'This is a small modal.'
  }
};

export const Large = {
  args: {
    open: true,
    title: 'Large Modal',
    size: 'lg',
    children: () => 'This is a large modal with more content space.'
  }
};

export const NoClose = {
  args: {
    open: true,
    title: 'No Close Button',
    showClose: false,
    children: () => 'This modal has no close button.'
  }
};
