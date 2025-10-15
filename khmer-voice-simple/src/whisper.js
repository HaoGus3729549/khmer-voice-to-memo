import { pipeline } from '@xenova/transformers';

let asr = null;

async function getASR() {
  if (asr) return asr;
  asr = await pipeline('automatic-speech-recognition', 'seanghay/whisper-small-khmer', { quantized: true });
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
      const res = await model(audio, { 
        language: "km", 
        task: "transcribe",
        chunk_length_s: 15,
        stride_length_s: 5
      });
      onPartial?.(res?.text || '');
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
      const res = await model(concat, { 
        language: "km", 
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 10
      });
      return res?.text || '';
    }
  };
}
