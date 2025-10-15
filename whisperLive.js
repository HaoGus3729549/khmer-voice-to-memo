/* eslint-disable no-unused-vars */
/* eslint-disable no-empty */
// ========================================
// Whisper Speech Recognition Setup
// Uses @xenova/transformers library with local models
// ========================================

import { env, pipeline } from '@xenova/transformers';

// Configure transformers to use local models only
env.allowLocalModels = true;
env.allowRemoteModels = false;  
env.localModelPath = '/models'; 
env.backends.onnx.wasm.wasmPaths = '/wasm';
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = true;  
const asr = await pipeline(
  'automatic-speech-recognition',
  'Xenova/whisper-tiny',  // English speech recognition model
  { quantized: false }
);

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

// ========================================
// ASR Pipeline Initialization
// Lazy-loads the model and verifies all required files exist
// ========================================

let _asr = null;
async function getASR() {
  if (_asr) return _asr;

  // Verify all required model files are accessible before loading
  const testUrls = [
    '/models/Xenova/whisper-tiny/config.json',
    '/models/Xenova/whisper-tiny/tokenizer.json',
    '/models/Xenova/whisper-tiny/onnx/encoder_model.onnx',
    '/models/Xenova/whisper-tiny/onnx/decoder_model_merged.onnx',
    '/wasm/ort-wasm-simd-threaded.wasm',
  ];
  for (const u of testUrls) {
    const r = await realFetch(u, { method: 'HEAD' }).catch(() => null);
    if (!r || !r.ok) {
      throw new Error(`[Whisper] missing or unreachable: ${u}`);
    }
  }

  // Load the Whisper model pipeline
  console.time('[whisper] load');
  _asr = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-tiny',
    { quantized: false }
  );
  console.timeEnd('[whisper] load');
  return _asr;
}

// ========================================
// Ring Buffer for Audio Stream Storage
// Circular buffer to store recent audio for real-time transcription
// ========================================

class RingBuffer {
  constructor(capacity) {
    this.buf = new Float32Array(capacity);
    this.capacity = capacity;
    this.size = 0;
    this.writePos = 0;
  }
  
  // Add new audio chunk to the buffer
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
  
  // Get the last n samples from the buffer
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

// ========================================
// Main Streaming Transcription Interface
// Creates a streaming transcriber with real-time partial results
// ========================================

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
          chunk_length_s: 15,
          stride_length_s: 5,
          return_timestamps: false,
        });
        onPartial?.(res?.text || '');
      }
    } catch (e) {} 
    finally {
      busy = false;
      if (pending) { pending = false; runPartial(); }
    }
  };

  return {
    // Accept incoming audio chunks
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
          chunk_length_s: 30,
          stride_length_s: 10,
          return_timestamps: false,
        });
        return res?.text || '';
      } catch (e) {
        console.error('[whisper] final error', e);
        return '';
      }
    }
  };
}
