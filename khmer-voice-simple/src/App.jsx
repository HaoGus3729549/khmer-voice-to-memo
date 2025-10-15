import React, { useState, useRef, useCallback } from 'react';
import { createWhisperStreamer } from './whisper';
import { downmixToMono, resampleTo16k } from './audio';

export default function App() {
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('Ready');
  
  const streamRef = useRef(null);
  const sttRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const nodeRef = useRef(null);

  const startRecording = useCallback(async () => {
    setStatus('Loading model...');
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true, 
        noiseSuppression: true,
        sampleRate: 16000 
      } 
    });
    streamRef.current = stream;
    
    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    
    // 使用 ScriptProcessorNode (虽然已废弃，但兼容性最好)
    const proc = ctx.createScriptProcessor(4096, source.channelCount || 1, 1);
    nodeRef.current = proc;
    
    sttRef.current = await createWhisperStreamer({
      sampleRate: 16000,
      onPartial: setText
    });
    
    proc.onaudioprocess = (ev) => {
      const inputBuffer = ev.inputBuffer;
      const L = inputBuffer.getChannelData(0);
      const R = inputBuffer.numberOfChannels > 1 ? inputBuffer.getChannelData(1) : null;
      const mono = downmixToMono(L, R);
      const resampled = resampleTo16k(mono, ctx.sampleRate);
      sttRef.current?.accept(resampled);
    };
    
    source.connect(proc);
    proc.connect(ctx.destination);
    setRecording(true);
    setStatus('Recording...');
  }, []);

  const stopRecording = useCallback(async () => {
    const result = await sttRef.current?.finish();
    setText(result || text);
    
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    await audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    
    setRecording(false);
    setStatus('Completed');
  }, [text]);

  const handleFile = useCallback(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    const mono = downmixToMono(audioBuffer.getChannelData(0));
    const resampled = resampleTo16k(mono, audioBuffer.sampleRate);
    
    const streamer = await createWhisperStreamer({ sampleRate: 16000 });
    streamer.accept(resampled);
    const result = await streamer.finish();
    
    setText(result);
    ctx.close();
  }, []);

  return (
    <div className="container">
      <h1>Khmer Voice to Text</h1>
      
      <div>
        <button 
          className={recording ? "btn btn-danger" : "btn btn-primary"}
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? 'Stop Recording' : 'Start Recording'}
        </button>
        <div className="status">{status}</div>
      </div>

      <div className="upload-area" onClick={() => document.getElementById('file').click()}>
        <div>Upload audio file</div>
        <input id="file" type="file" accept="audio/*" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} style={{display: 'none'}} />
      </div>

      {text && <div className="result">{text}</div>}
    </div>
  );
}
