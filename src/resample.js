// ========================================
// Audio Preprocessing Utilities
// ========================================

// Convert stereo audio to mono by averaging left and right channels
export function downmixToMono(L, R) {
  if (!R || R.length !== L.length) return Float32Array.from(L);
  const out = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) out[i] = 0.5 * (L[i] + R[i]);
  return out;
}

// Resample audio to 16kHz (required for Whisper model)
// Uses linear interpolation for resampling
export function resampleTo16k(input, srcRate) {
  const dstRate = 16000;
  if (srcRate === dstRate) return Float32Array.from(input);
  const ratio = srcRate / dstRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = pos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}
