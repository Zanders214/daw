/**
 * Trigger a browser download for an in-memory Blob via a temporary object URL
 * and a hidden <a download>. The repo had no download idiom; this is the shared
 * one (used by the WAV bounce, reusable for future exports).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click is processed so the download isn't cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
