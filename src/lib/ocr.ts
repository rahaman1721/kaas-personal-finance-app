import { loadImage } from './media';

export interface NumberScan {
  /** Every distinct amount found, in reading order. */
  numbers: number[];
  /** Best guess for the bill total. */
  suggestedTotal: number;
  /** How the guess was made, shown to the user so it can be trusted or corrected. */
  reason: 'sum-of-others' | 'largest' | 'only-one' | 'none';
}

const MAX_AMOUNT = 10_000_000;

/**
 * Pull amounts out of recognised text. Handles 1,25,000 / 1,250.50 / 450.
 * Years and lone single digits that are almost always stray marks are ignored.
 */
export const extractNumbers = (text: string): number[] => {
  const out: number[] = [];
  const matches = text.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? [];
  for (const raw of matches) {
    const value = parseFloat(raw.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) continue;
    if (Number.isInteger(value) && value >= 1990 && value <= 2100 && raw.length === 4) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
};

/**
 * Handwritten shop notes list item prices and then a total. If one number equals the
 * sum of all the others, that is the total. Otherwise the largest number is the best guess.
 */
export const analyseNumbers = (numbers: number[]): NumberScan => {
  if (numbers.length === 0) return { numbers, suggestedTotal: 0, reason: 'none' };
  if (numbers.length === 1) return { numbers, suggestedTotal: numbers[0], reason: 'only-one' };
  const sum = numbers.reduce((a, b) => a + b, 0);
  for (const n of numbers) {
    if (Math.abs(sum - n - n) < 0.5) return { numbers, suggestedTotal: n, reason: 'sum-of-others' };
  }
  return { numbers, suggestedTotal: Math.max(...numbers), reason: 'largest' };
};

/** Otsu's method: the grey level that best separates ink from paper. */
const otsuThreshold = (hist: number[], total: number): number => {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
};

/**
 * Prepare a phone photo for digit recognition: cap the size (huge photos are slow and
 * run out of memory), convert to grey, stretch contrast, then binarise with an
 * adaptive threshold so uneven lighting on paper does not wipe out the ink.
 */
export const prepareForOCR = async (dataUrl: string, maxSide = 1600): Promise<string> => {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  const hist = new Array<number>(256).fill(0);
  const grey = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    grey[p] = g;
    hist[g]++;
  }
  // Contrast stretch between the 2nd and 98th percentile.
  const count = w * h;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= count * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= count * 0.02) { hi = i; break; } }
  const range = Math.max(1, hi - lo);
  const stretched = new Array<number>(256).fill(0);
  for (let p = 0; p < grey.length; p++) {
    const v = Math.min(255, Math.max(0, Math.round(((grey[p] - lo) * 255) / range)));
    grey[p] = v;
    stretched[v]++;
  }
  const t = otsuThreshold(stretched, count);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const v = grey[p] > t ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
};

export class OcrUnavailableError extends Error {}

/**
 * Read digits from a photo. Recognition is restricted to digits, comma and dot so that
 * handwriting is never "read" as letters. The first run downloads the language data,
 * which needs a connection; that failure is reported as OcrUnavailableError.
 */
export const scanNumbers = async (photoDataUrl: string, timeoutMs = 60_000): Promise<NumberScan> => {
  const prepared = await prepareForOCR(photoDataUrl);
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.,',
      tessedit_pageseg_mode: '11' as never, // sparse text: numbers scattered on a page
    });
    const result = await Promise.race([
      worker.recognize(prepared),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return analyseNumbers(extractNumbers(result.data.text));
  } catch (e) {
    if (e instanceof Error && e.message === 'timeout') throw e;
    throw new OcrUnavailableError(e instanceof Error ? e.message : 'OCR failed');
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
  }
};
