/**
 * Copy text in a click handler. Prefer a synchronous execCommand first so the
 * user gesture is not lost if the Clipboard API is blocked (common in dialogs).
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (tryExecCommandCopy(text)) return;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error('Copy failed');
}

function tryExecCommandCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  Object.assign(textarea.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '0',
    border: '0',
    opacity: '0',
    outline: 'none',
    boxShadow: 'none',
    background: 'transparent',
    zIndex: '2147483647',
  });

  // Append inside the open dialog so MUI inert/aria-hidden on the rest of the
  // page does not block selection and copy.
  const host =
    document.querySelector<HTMLElement>('.MuiDialog-container [role="dialog"]') ??
    document.querySelector<HTMLElement>('[role="dialog"]') ??
    document.body;

  host.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;

  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  host.removeChild(textarea);

  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }

  return copied;
}
