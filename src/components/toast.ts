type ToastType = 'success' | 'error' | 'warning' | 'info';

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
};

export function showToast(
  message: string,
  type: ToastType = 'info',
  durationMs = 3000
): void {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${ICONS[type]}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('exiting');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, durationMs);
}
