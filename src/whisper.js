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

let asr = null;

async function getASR() {
  if (asr) return asr;
  
  try {
    // Ensure transformers is properly initialized
    if (typeof window !== 'undefined') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    asr = await pipeline('automatic-speech-recognition', 'seanghay/whisper-small-khmer', { 
      quantized: true,
      progress_callback: (progress) => {
        console.log('[Khmer STT] Loading progress:', Math.round(progress.progress * 100) + '%');
      }
    });
  } catch (error) {
    console.warn('[Khmer STT] Failed to load seanghay/whisper-small-khmer, trying fallback...', error);
    asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { 
      quantized: true 
    });
  }
  
  return asr;
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
  const model = await getASR();
  const partial = new RingBuffer(sampleRate * 8);
  const all = [];
  let busy = false;

  const runPartial = async () => {
    if (busy) return;
    busy = true;
    const audio = partial.tail(sampleRate * 8);
    if (audio.length > sampleRate * 1.2) {
      try {
        const res = await model(audio, { 
          language: "km", 
          task: "transcribe",
          chunk_length_s: 15,
          stride_length_s: 5
        });
        onPartial?.(res?.text || '');
      } catch (error) {
        try {
          const res = await model(audio, { 
            language: "en", 
            task: "transcribe",
            chunk_length_s: 15,
            stride_length_s: 5
          });
          onPartial?.(res?.text || '');
        } catch (fallbackError) {
          // 静默处理错误
        }
      }
    }
    busy = false;
  };

  return {
    accept(f32mono16k) {
      if (!f32mono16k?.length) return;
      partial.push(f32mono16k);
      all.push(f32mono16k);
      runPartial();
    },
    
    async finish() {
      const len = all.reduce((a, b) => a + b.length, 0);
      const concat = new Float32Array(len);
      let off = 0; 
      for (const c of all) { 
        concat.set(c, off); 
        off += c.length; 
      }
      
      try {
        const res = await model(concat, { 
          language: "km", 
          task: "transcribe",
          chunk_length_s: 30,
          stride_length_s: 10
        });
        return res?.text || '';
      } catch (error) {
        try {
          const res = await model(concat, { 
            language: "en", 
            task: "transcribe",
            chunk_length_s: 30,
            stride_length_s: 10
          });
          return res?.text || '';
        } catch (fallbackError) {
          return '';
        }
      }
    }
  };
}
