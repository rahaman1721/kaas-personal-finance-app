import { Capacitor } from '@capacitor/core';

/**
 * Hand a text file to the user. On Android/iOS the WebView cannot download blobs,
 * so the file is written to the cache and opened in the system share sheet.
 * On the web it is a normal download.
 */
export const deliverFile = async (filename: string, content: string, mime: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const written = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: written.uri, dialogTitle: 'Save or share' });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Read a user-chosen text file (backup import). Resolves to null on cancel. */
export const pickTextFile = (accept: string): Promise<string | null> =>
  new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });

/** RFC 4180 field, with a leading apostrophe on formula-like text (CSV injection). */
export const csvCell = (value: string | number): string => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
