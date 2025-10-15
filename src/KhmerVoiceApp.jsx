/* eslint-disable no-empty */
// ========================================
// Khmer Voice STT Testing App
// Simplified version for testing Khmer speech recognition
// ========================================

import React, { useCallback, useRef, useState } from "react";
import { createWhisperStreamer } from "./whisperLive";
import { downmixToMono, resampleTo16k } from "./resample";

// ========================================
// Utility Functions
// ========================================

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const t = Math.floor(ms / 1000);
  const s = String(t % 60).padStart(2, "0");
  const m = String(Math.floor(t / 60) % 60).padStart(2, "0");
  const h = Math.floor(t / 3600);
  return (h ? h + ":" : "") + m + ":" + s;
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

// ========================================
// Main Component
// ========================================

export default function KhmerVoiceApp() {
  // React state
  const [status, setStatus] = useState("Ready to start");
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [partial, setPartial] = useState("");
  const [finalText, setFinalText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs for audio recording
  const streamRef = useRef(null);
  const mediaRecRef = useRef(null);
  const audioCtxRef = useRef(null);
  const nodeRef = useRef(null);
  const sourceRef = useRef(null);
  const sttRef = useRef(null);
  const startRef = useRef(0);
  const intRef = useRef(null);

  // ========================================
  // Recording Functions
  // ========================================

  const startRecording = useCallback(async () => {
    try {
      setFinalText("");
      setPartial("");
      setError(null);
      setIsLoading(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Start MediaRecorder
      const mime = pickMime();
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRecRef.current = mr;
      mr.start(200);

      startRef.current = Date.now();
      setRecording(true);
      setStatus("Recording — initializing Khmer STT…");
      intRef.current = setInterval(
        () => setTimer(Date.now() - startRef.current),
        250
      );

      // Setup audio processing
      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: "interactive",
      });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const proc = ctx.createScriptProcessor(4096, source.channelCount || 1, 1);
      nodeRef.current = proc;

      // Initialize Khmer STT
      try {
        setStatus("Loading Khmer STT model…");
        sttRef.current = await createWhisperStreamer({
          sampleRate: 16000,
          onPartial: (txt) => setPartial(txt || ""),
        });
        console.info("[Khmer STT] ready");
        setStatus("Recording in Khmer…");
        setIsLoading(false);
      } catch (e) {
        sttRef.current = null;
        console.warn("[Khmer STT] init failed", e);
        setError(`STT model loading failed: ${e.message || e}`);
        setStatus(`Recording — STT error: ${e.message || e}`);
        setIsLoading(false);
      }

      // Process audio chunks
      proc.onaudioprocess = (ev) => {
        try {
          const L = ev.inputBuffer.getChannelData(0);
          const R =
            ev.inputBuffer.numberOfChannels > 1
              ? ev.inputBuffer.getChannelData(1)
              : null;
          const mono = downmixToMono(L, R);
          const f16k = resampleTo16k(mono, ctx.sampleRate);
          sttRef.current?.accept(f16k);
        } catch {}
      };

      source.connect(proc);
    } catch (e) {
      console.error("Recording start error", e);
      setError(`Recording start error: ${e.message || "need microphone permission"}`);
      setStatus("Error: Microphone permission required");
      setIsLoading(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      setStatus("Processing…");
      if (intRef.current) clearInterval(intRef.current);
      setTimer(0);
      setRecording(false);

      // Stop audio processing
      try {
        nodeRef.current?.disconnect();
        sourceRef.current?.disconnect();
        await audioCtxRef.current?.close();
      } catch {}

      nodeRef.current = null;
      sourceRef.current = null;
      audioCtxRef.current = null;

      // Get final transcription
      let result = "";
      try {
        result = (await sttRef.current?.finish()) || "";
      } catch {}
      sttRef.current = null;

      // Stop MediaRecorder
      const mr = mediaRecRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {}
      }

      setFinalText(result || partial || "No transcription available");
      setPartial("");
      setStatus("Completed");
    } catch (e) {
      console.error("Stop recording error", e);
      setStatus("Error stopping recording");
    } finally {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
  }, [partial]);

  // ========================================
  // File Upload Functions
  // ========================================

  const processAudioFile = useCallback(async (file) => {
    if (!file.type.startsWith("audio/")) {
      setError("Please select an audio file");
      setStatus("Error: Please select an audio file");
      return;
    }

    setStatus("Loading audio file…");
    setFinalText("");
    setPartial("");
    setError(null);
    setIsLoading(true);

    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Decode audio
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Convert to mono and resample to 16kHz
      const channelData = audioBuffer.getChannelData(0);
      const secondChannel =
        audioBuffer.numberOfChannels > 1
          ? audioBuffer.getChannelData(1)
          : null;
      const mono = downmixToMono(channelData, secondChannel);
      const resampled = resampleTo16k(mono, audioBuffer.sampleRate);

      setStatus("Using Khmer model to transcribe…");

      // Initialize STT
      const streamer = await createWhisperStreamer({
        sampleRate: 16000,
        onPartial: (txt) => setPartial(txt || ""),
      });

      // Feed all audio at once
      streamer.accept(resampled);

      // Get final result
      const result = await streamer.finish();
      setFinalText(result || "No transcription result");
      setPartial("");
      setStatus("Completed!");
      setIsLoading(false);

      await ctx.close();
    } catch (e) {
      console.error("File processing error", e);
      setError(`File processing failed: ${e.message || "Failed to process audio file"}`);
      setStatus(`Error: ${e.message || "Failed to process audio file"}`);
      setIsLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) processAudioFile(file);
    },
    [processAudioFile]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processAudioFile(file);
    },
    [processAudioFile]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // ========================================
  // Initialization Effect
  // ========================================
  
  React.useEffect(() => {
    setIsInitialized(true);
  }, []);

  // ========================================
  // Render
  // ========================================

  if (!isInitialized) {
    return (
      <div className="container">
        <h1>Khmer Voice to Text</h1>
        <p style={{ textAlign: "center", color: "#7f8c8d", marginBottom: 20 }}>
          ver 0.1.0
        </p>
        <div className="status processing">
          <strong>Initializing application...</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Khmer Voice to Text</h1>
      <p style={{ textAlign: "center", color: "#7f8c8d", marginBottom: 20 }}>
      ver 0.1.0
      </p>

      {error && (
        <div className="status error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="row">
        <button
          className={`btn ${recording ? "btn-danger" : "btn-primary"}`}
          onClick={() => (recording ? stopRecording() : startRecording())}
          disabled={isLoading}
        >
          {isLoading ? "⏳ Loading..." : recording ? "■ Stop recording" : "● Start recording"}
        </button>
        <span className="pill">
          {status}
          {timer > 0 ? ` — ${formatDuration(timer)}` : ""}
        </span>
      </div>

      {recording && (
        <div className="card mt-2" style={{ background: "#fffbe6" }}>
          <strong className="card-title">
            Listening… {sttRef.current ? "(实时转录)" : "(无STT)"}
          </strong>
          <p className="m-0" style={{ minHeight: 24 }}>
            {partial || "…"}
          </p>
        </div>
      )}

      <h2 className="mt-3">...Or uploading</h2>
      <div
        className={`upload-area ${dragOver ? "dragover" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById("fileInput").click()}
      >
        <div className="upload-text">📁 Drag and drop audio file here or click to select</div>
        <div className="upload-hint">Supported formats: WAV, MP3, OGG, WEBM</div>
      </div>
      <input
        id="fileInput"
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {(finalText || partial) && (
        <div>
          <h2 className="mt-3">Transcription Result</h2>
          <div className="card">
            <strong className="card-title">Khmer Text Output</strong>
            <div className="result">{finalText || partial || "Processing..."}</div>
          </div>
        </div>
      )}
    </div>
  );
}

