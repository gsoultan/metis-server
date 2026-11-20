/**
 * Saves a JSON value as a file the browser downloads. The value is written
 * exactly as the engine returned it: a signed file must keep its bytes.
 */
export function saveJSONFile(value: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
