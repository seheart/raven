// Tiny helpers shared by the pulse-lab shape variants.
// Lives here (not /utils) so deleting the lab folder cleans everything up.

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

export function rgba(hex, a) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a})` : `rgba(150,150,200,${a})`;
}

export function resolveThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue('--accent').trim() || '#a47eff',
    success: s.getPropertyValue('--success').trim() || '#5fc88a',
    error: s.getPropertyValue('--error').trim() || '#ef5d6e',
    warning: s.getPropertyValue('--warning').trim() || '#f5b045',
    muted: s.getPropertyValue('--muted').trim() || '#7a6a8e'
  };
}

export const TYPE_COLORS = {
  tool_call: 'muted',
  tool_result: 'muted',
  inference: 'muted',
  user_message: 'accent',
  assistant_message: 'accent',
  assistant: 'accent',
  human: 'accent',
  file_edit: 'success',
  file_create: 'success',
  file_add: 'success',
  file_delete: 'error',
  error: 'error',
  warning: 'warning'
};

// Normalize incoming websocket events into a single burst type.
export function eventToType(data) {
  return data?.event_type || data?.type || 'tool_call';
}

export function fileChangeToType(data) {
  const c = data?.change_type;
  return c === 'unlink' ? 'file_delete' : c === 'add' ? 'file_create' : 'file_edit';
}
