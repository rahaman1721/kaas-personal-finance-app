import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export type ImageSource = 'camera' | 'gallery';

const pickViaInput = (source: ImageSource): Promise<string | null> =>
  new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    // The browser fires no event when the picker is dismissed, so resolve on refocus.
    window.addEventListener('focus', () => setTimeout(() => !input.files?.length && resolve(null), 500), { once: true });
    input.click();
  });

/**
 * Get a photo as a data URL. Native builds use the Capacitor camera/gallery;
 * the browser falls back to a file input (no PWA-elements dependency).
 * Resolves to null when the user cancels.
 */
export const pickImage = async (source: ImageSource): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return pickViaInput(source);
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    });
    return photo.dataUrl ?? null;
  } catch {
    return null; // user cancelled or permission denied
  }
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be read'));
    img.src = src;
  });

/** Downscale to `maxSide` and re-encode as JPEG so photos fit in local storage. */
export const compressImage = async (dataUrl: string, maxSide = 1024, quality = 0.6): Promise<string> => {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
};

export { loadImage };
