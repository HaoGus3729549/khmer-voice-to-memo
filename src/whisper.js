import { env, pipeline } from '@xenova/transformers';

// Configure transformers to use remote models
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useCustomCache = false;

// Custom fetch function to handle asset loading errors
const realFetch = (typeof window !== 'undefined' ? window.fetch : fetch);
env.fetch = async (url, init) => {
  const res = await realFetch(url, init);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || ct.startsWith('text/html')) {
    console.error('[Whisper assets] unexpected response', { url, status: res.status, contentType: ct });
  }
  return res;
};

let _asr = null;
let _loadingPromise = null;

async function getASR() {
  if (_asr) return _asr;
  
  // Prevent multiple simultaneous loading attempts
  if (_loadingPromise) return _loadingPromise;
  
  _loadingPromise = loadModel();
  return _loadingPromise;
}

async function loadModel() {
  console.time('[khmer-whisper] load');
  
  try {
    // Ensure transformers is properly initialized
    if (typeof window !== 'undefined') {
      // Wait a bit for the library to fully initialize
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Try the Khmer Whisper model first
    _asr = await pipeline(
      'automatic-speech-recognition',
      'seanghay/whisper-small-khmer',
      { 
        quantized: true,
        progress_callback: (progress) => {
          console.log('[Khmer STT] Loading progress:', Math.round(progress.progress * 100) + '%');
        }
      }
    );
    console.timeEnd('[khmer-whisper] load');
    console.log('[Khmer STT] Model loaded successfully');
    _loadingPromise = null; // Clear the loading promise on success
    return _asr;
  } catch (error) {
    console.warn('[Khmer STT] Failed to load seanghay/whisper-small-khmer, trying fallback...', error);
    
    // Fallback to generic Whisper with language specification
    try {
      _asr = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny',
        { 
          quantized: true,
          progress_callback: (progress) => {
            console.log('[Khmer STT] Fallback loading progress:', Math.round(progress.progress * 100) + '%');
          }
        }
      );
      console.timeEnd('[khmer-whisper] load');
      console.log('[Khmer STT] Fallback model loaded');
      _loadingPromise = null; // Clear the loading promise on success
      return _asr;
    } catch (fallbackError) {
      console.error('[Khmer STT] Both models failed to load', fallbackError);
      _loadingPromise = null; // CRITICAL: Clear the loading promise on failure so next attempt can retry
      _asr = null; // Clear the ASR on failure
      throw new Error('Failed to load any speech recognition model');
    }
  }
}

class RingBuffer {
  constructor(capacity) {
    this.buf = new Float32Array(capacity);
    this.capacity = capacity;
    this.size = 0;
    this.writePos = 0;
  }
  
  push(chunk) {
    const n = chunk.length;
    if (n >= this.capacity) {
      this.buf.set(chunk.subarray(n - this.capacity));
      this.size = this.capacity;
      this.writePos = 0;
      return;
    }
    const first = Math.min(n, this.capacity - this.writePos);
    this.buf.set(chunk.subarray(0, first), this.writePos);
    if (n > first) this.buf.set(chunk.subarray(first), 0);
    this.writePos = (this.writePos + n) % this.capacity;
    this.size = Math.min(this.size + n, this.capacity);
  }
  
  tail(n) {
    n = Math.min(n, this.size);
    const out = new Float32Array(n);
    const start = (this.writePos - n + this.capacity) % this.capacity;
    const first = Math.min(n, this.capacity - start);
    out.set(this.buf.subarray(start, start + first), 0);
    if (n > first) out.set(this.buf.subarray(0, n - first), first);
    return out;
  }
}

export async function createWhisperStreamer({ sampleRate = 16000, onPartial } = {}) {
  const asr = await getASR();

  // Configuration: Keep last 8 seconds for partial transcription
  const PARTIAL_S = 8;
  const partial = new RingBuffer(sampleRate * PARTIAL_S);
  const all = [];  // Store all audio for final transcription
  let busy = false, pending = false;

  // Run transcription on the recent audio buffer (non-blocking)
  const runPartial = async () => {
    if (busy) { pending = true; return; }
    busy = true;
    try {
      const audio = partial.tail(sampleRate * PARTIAL_S);
      if (audio.length > sampleRate * 1.2) {  // At least 1.2 seconds
        const res = await asr(audio, {
          language: "km",  // Khmer language code
          task: "transcribe",
          chunk_length_s: 15,
          stride_length_s: 5,
          return_timestamps: false,
        });
        onPartial?.(res?.text || '');
      }
    } catch (e) {
      console.warn('[Khmer STT] Partial transcription error:', e);
    } 
    finally {
      busy = false;
      if (pending) { pending = false; runPartial(); }
    }
  };

  return {
    accept(f32mono16k) {
      if (!f32mono16k?.length) return;
      partial.push(f32mono16k);
      all.push(f32mono16k);
      runPartial();
    },
    
    // Finalize and transcribe all recorded audio
    async finish() {
      const len = all.reduce((a, b) => a + b.length, 0);
      const concat = new Float32Array(len);
      let off = 0; for (const c of all) { concat.set(c, off); off += c.length; }
      try {
        const res = await asr(concat, {
          language: "km",  // Khmer language code
          task: "transcribe",
          chunk_length_s: 30,
          stride_length_s: 10,
          return_timestamps: false,
        });
        return res?.text || '';
      } catch (e) {
        console.error('[Khmer STT] Final transcription error:', e);
        return '';
      }
    }
  };
}
