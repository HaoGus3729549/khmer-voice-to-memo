import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createWhisperStreamer } from './whisper';
import { downmixToMono, resampleTo16k } from './audio';
import { saveMemo, getAllMemos, deleteMemo } from './db';
import AudioPlayer from './AudioPlayer';

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const t = Math.floor(ms / 1000);
  const s = String(t % 60).padStart(2, "0");
  const m = String(Math.floor(t / 60) % 60).padStart(2, "0");
  const h = Math.floor(t / 3600);
  return (h ? h + ":" : "") + m + ":" + s;
}

function formatDate(ts) {
  // Use English locale for international compatibility
  // Format: Jan 20, 2025, 4:30:45 PM
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(new Date(ts));
}

function pickMime() {
  const prefer = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of prefer) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

export default function App() {
  const [status, setStatus] = useState("Ready");
  const [timer, setTimer] = useState(0);
  const [memos, setMemos] = useState([]);
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState("");
  const [mode, setMode] = useState("record");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");
  
  const streamRef = useRef(null);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const nodeRef = useRef(null);
  const sourceRef = useRef(null);
  const sttRef = useRef(null);
  const startRef = useRef(0);
  const intRef = useRef(null);
  const usedMimeRef = useRef("audio/webm");

  const load = useCallback(async () => setMemos(await getAllMemos()), []);

  const handleFileUpload = useCallback(async (file) => {
    if (!file.type.startsWith("audio/")) {
      setUploadProgress("Please select an audio file");
      return;
    }
    
    setUploadFile(file);
    setUploadProgress("File selected");
    
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const durationMs = audioBuffer.duration * 1000;
    await ctx.close();
    
    setUploadProgress(`File selected - ${formatDuration(durationMs)}`);
  }, []);

  const processUploadedFile = useCallback(async () => {
    if (!uploadFile) return;
    
    try {
      setUploadProgress("Decoding...");
      const arrayBuffer = await uploadFile.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      setUploadProgress("Processing audio...");
      const mono = downmixToMono(audioBuffer.getChannelData(0));
      const resampled = resampleTo16k(mono, audioBuffer.sampleRate);
      
      setUploadProgress("Transcribing...");
      const streamer = await createWhisperStreamer({ sampleRate: 16000 });
      streamer.accept(resampled);
      const result = await streamer.finish();
      
      setUploadProgress("Saving...");
      const durationMs = audioBuffer.duration * 1000;
      const rec = {
        id: crypto.randomUUID(),
        created: Date.now(),
        durationMs,
        mime: uploadFile.type,
        blob: uploadFile, // directly use the original file, don't re-create Blob
        transcript: result || "",
      };
      
      await saveMemo(rec);
      await load();
      await ctx.close();
      
      setUploadFile(null);
      setUploadProgress("Completed");
    } catch (error) {
      console.error("Upload processing error:", error);
      setUploadProgress(`Processing failed: ${error.message || "Unknown error"}`);
      setUploadFile(null);
    }
  }, [uploadFile, load]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;

    chunksRef.current = [];
    const mime = pickMime();
    usedMimeRef.current = mime || "audio/webm";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mediaRecRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    mr.start(200);

    startRef.current = Date.now();
    setRecording(true);
    setStatus("Recording — starting STT...");
    intRef.current = setInterval(
      () => setTimer(Date.now() - startRef.current),
      250
    );

    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const proc = ctx.createScriptProcessor(4096, source.channelCount || 1, 1);
    nodeRef.current = proc;

    sttRef.current = await createWhisperStreamer({
      sampleRate: 16000,
      onPartial: (txt) => setPartial(txt || ""),
    });
    setStatus("Recording");

    proc.onaudioprocess = (ev) => {
      const L = ev.inputBuffer.getChannelData(0);
      const R = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : null;
      const mono = downmixToMono(L, R);
      const f16k = resampleTo16k(mono, ctx.sampleRate);
      sttRef.current?.accept(f16k);
    };

    source.connect(proc);
  }, []);

  const stop = useCallback(async () => {
    setStatus("Saving...");
    if (intRef.current) clearInterval(intRef.current);
    setTimer(0);
    setRecording(false);

    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    await audioCtxRef.current?.close();
    nodeRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;

    let finalText = "";
    finalText = (await sttRef.current?.finish()) || "";
    sttRef.current = null;

    const mr = mediaRecRef.current;
    if (mr && mr.state !== "inactive") {
      await new Promise((resolve) => {
        mr.onstop = () => resolve();
        mr.stop();
      });
    }
    const blob = new Blob(chunksRef.current, { type: usedMimeRef.current });
    chunksRef.current = [];

    const durationMs = Math.max(0, Date.now() - (startRef.current || Date.now()));

    const rec = {
      id: crypto.randomUUID(),
      created: startRef.current || Date.now(),
      durationMs,
      mime: blob.type,
      blob,
      transcript: finalText || partial || "",
    };
    await saveMemo(rec);
    await load();

    setPartial("");
    setStatus("Completed!");
  }, [load, partial]);

  const del = useCallback(
    async (id) => {
      if (!window.confirm("Delete this memo?")) return;
      await deleteMemo(id);
      await load();
    },
    [load]
  );

  useEffect(() => {
    load();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (intRef.current) clearInterval(intRef.current);
    };
  }, [load]);

  return (
    <div className="container">
      <h1>Khmer STT</h1>

      <div className="row">
        <div className="mode-switch">
          <button
            className={`btn ${mode === "record" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("record")}
          >
            Record
          </button>
          <button
            className={`btn ${mode === "upload" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("upload")}
          >
            Upload
          </button>
        </div>
        <span className="pill">
          {mode === "record" ? status : uploadProgress}
          {mode === "record" && timer > 0 ? ` — ${formatDuration(timer)}` : ""}
        </span>
      </div>

      {mode === "record" && (
        <>
          <div className="row">
            <button
              className={`btn ${recording ? "btn-danger" : "btn-primary"}`}
              onClick={() => (recording ? stop() : start())}
            >
              {recording ? "■ Stop" : "● Start"}
            </button>
          </div>
          {recording && (
            <div className="card" style={{ background: "#fffbe6" }}>
              <strong className="card-title">Listening...</strong>
              <p className="m-0" style={{ minHeight: 24 }}>
                {partial || "…"}
              </p>
            </div>
          )}
        </>
      )}

      {mode === "upload" && (
        <div className="upload-section">
          {!uploadFile ? (
            <div className="upload-area" onClick={() => document.getElementById('fileInput').click()}>
              <div>Click to select audio file</div>
              <div className="upload-hint">Supported formats: WAV, MP3, OGG, WEBM</div>
              <input
                id="fileInput"
                type="file"
                accept="audio/*"
                onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <div className="card" style={{ background: "#f8f9fa" }}>
              <strong className="card-title">File Preview</strong>
              <p className="m-0">File name: {uploadFile.name}</p>
              <p className="m-0">Size: {(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
              <p className="m-0">Type: {uploadFile.type}</p>
              <div className="row mt-2">
                <button className="btn btn-primary" onClick={processUploadedFile}>
                  ✓ Confirm transcription
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  setUploadFile(null);
                  setUploadProgress("");
                }}>
                  ✗ Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <h2 className="mt-3">Saved Memos</h2>
      <div className="grid">
        {memos.length === 0 && <p className="subtle">No memos yet</p>}
        {memos.map((m) => (
          <div key={m.id} className="card">
            <div className="card-row">
              <strong className="card-title grow">
                Memo — {formatDate(m.created)}
              </strong>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const url = URL.createObjectURL(m.blob);
                  const a = document.createElement("a");
                  const ext = m.mime?.includes("ogg") ? "ogg" : "webm";
                  a.href = url;
                  a.download = `memo_audio_${new Date(m.created)
                    .toISOString()
                    .replace(/[:.]/g, "-")}.${ext}`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                🎵 Audio
              </button>
              {m.transcript && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const content = `Memo Transcript\n\nDate: ${formatDate(m.created)}\nDuration: ${formatDuration(m.durationMs)}\n\nTranscription:\n${m.transcript}`;
                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `memo_transcript_${new Date(m.created)
                      .toISOString()
                      .replace(/[:.]/g, "-")}.txt`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  📝 Text
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => del(m.id)}>
                🗑 Delete
              </button>
            </div>
            
            <AudioPlayer 
              blob={m.blob} 
              title={`Record ${formatDate(m.created)}`}
            />
            <p className="subtle mt-1">
              {m.mime || "audio"} • {formatDuration(m.durationMs)}
            </p>
            {m.transcript && (
              <div className="card mt-1" style={{ background: "#fff7e6" }}>
                <strong className="card-title">Transcription Result</strong>
                <p className="m-0">{m.transcript}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
