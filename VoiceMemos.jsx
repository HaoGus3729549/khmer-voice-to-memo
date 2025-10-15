/* eslint-disable no-empty */
// ========================================
// Voice Memos React Component
// Main UI for recording, transcribing, and managing voice memos
// ========================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createWhisperStreamer } from "../stt/whisperLive";
import { downmixToMono, resampleTo16k } from "../audio/resample";

// ========================================
// IndexedDB Database Operations
// Store voice memos locally in the browser
// ========================================

const DB_NAME = "voice-memos-db";
const STORE = "memos";
const DB_VER = 2;

// Initialize database connection
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("created", "created", { unique: false });
      } else {
        const s = req.transaction.objectStore(STORE);
        if (!s.indexNames.contains("created")) {
          s.createIndex("created", "created", { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Save a memo to database
async function dbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Retrieve all memos
async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("created").getAll();
    req.onsuccess = () =>
      resolve((req.result || []).sort((a, b) => b.created - a.created));
    req.onerror = () => reject(req.error);
  });
}

// Delete a memo by ID
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ========================================
// Utility Functions
// ========================================

// Format milliseconds as HH:MM:SS or MM:SS
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const t = Math.floor(ms / 1000);
  const s = String(t % 60).padStart(2, "0");
  const m = String(Math.floor(t / 60) % 60).padStart(2, "0");
  const h = Math.floor(t / 3600);
  return (h ? h + ":" : "") + m + ":" + s;
}

// Format timestamp as readable date
function formatDate(ts) {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

// Select best supported audio format for recording
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
  return ""; // let the browser decide
}

// ========================================
// Main Component
// ========================================

export default function VoiceMemos() {
  // React state
  const [status, setStatus] = useState("Idle");
  const [timer, setTimer] = useState(0);
  const [memos, setMemos] = useState([]);
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState("");  // Real-time transcription preview

  // Refs for audio recording and processing
  const streamRef = useRef(null);          // MediaStream from microphone
  const mediaRecRef = useRef(null);        // MediaRecorder for saving audio
  const chunksRef = useRef([]);            // Audio data chunks
  const audioCtxRef = useRef(null);        // AudioContext for processing
  const nodeRef = useRef(null);            // ScriptProcessorNode
  const sourceRef = useRef(null);          // MediaStreamSource
  const sttRef = useRef(null);             // Whisper transcriber instance
  const startRef = useRef(0);              // Recording start timestamp
  const intRef = useRef(null);             // Timer interval
  const usedMimeRef = useRef("audio/webm"); // Audio format used

  // Load all saved memos from database
  const load = useCallback(async () => setMemos(await dbAll()), []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // MediaRecorder
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
      setStatus("Recording — starting STT…");
      intRef.current = setInterval(
        () => setTimer(Date.now() - startRef.current),
        250
      );

      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: "interactive",
      });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const proc = ctx.createScriptProcessor(4096, source.channelCount || 1, 1);
      nodeRef.current = proc;


      try {
        sttRef.current = await createWhisperStreamer({
          sampleRate: 16000,
          onPartial: (txt) => setPartial(txt || ""),
        });
        console.info("[STT] ready");
        setStatus("Recording");
      } catch (e) {
        sttRef.current = null;
        console.warn("[STT] init failed — continuing without STT", e);
        setStatus(`Recording — STT error: ${e.message || e}`);
      }

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
      console.error("start error", e);
      setStatus("Microphone permission required or audio init failed");
    }
  }, []);
  async function computeDurationMs(blob, approxMs) {
    try {
      const url = URL.createObjectURL(blob);
      const sec = await new Promise((resolve) => {
        const a = new Audio();
        a.preload = "metadata";
        a.src = url;
        a.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(Number.isFinite(a.duration) ? a.duration : NaN);
        };
        a.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(NaN);
        };
      });
      if (Number.isFinite(sec) && sec > 0) return sec * 1000;
    } catch {}
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await blob.arrayBuffer();
      const decoded = await ac.decodeAudioData(buf.slice(0));
      const ms = decoded.duration * 1000;
      await ac.close();
      if (Number.isFinite(ms) && ms > 0) return ms;
    } catch {}
    return Math.max(0, approxMs);
  }
  const stop = useCallback(async () => {
    try {
      setStatus("Saving…");
      if (intRef.current) clearInterval(intRef.current);
      setTimer(0);
      setRecording(false);

      try {
        nodeRef.current?.disconnect();
        sourceRef.current?.disconnect();
      } catch {}
      try {
        await audioCtxRef.current?.close();
      } catch {}
      nodeRef.current = null;
      sourceRef.current = null;
      audioCtxRef.current = null;

      let finalText = "";
      try {
        finalText = (await sttRef.current?.finish()) || "";
      } catch {}
      sttRef.current = null;

      const mr = mediaRecRef.current;
      if (mr && mr.state !== "inactive") {
        await new Promise((resolve) => {
          mr.onstop = () => resolve();
          try { mr.stop(); } catch { resolve(); }
        });
      }
      const blob = new Blob(chunksRef.current, { type: usedMimeRef.current });
      chunksRef.current = [];

      const approxMs = Math.max(0, Date.now() - (startRef.current || Date.now()));
      const durationMs = await computeDurationMs(blob, approxMs);

      const rec = {
        id: crypto.randomUUID(),
        created: startRef.current || Date.now(),
        durationMs,
        mime: blob.type,
        blob,
        transcript: finalText || partial || "",
      };
      await dbPut(rec);
      await load();

      setPartial("");
      setStatus("Idle");
    } catch (e) {
      console.error("stop error", e);
      setStatus("Idle");
    } finally {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
  }, [load, partial]);

  const del = useCallback(
    async (id) => {
      if (!window.confirm("Delete this memo?")) return;
      await dbDelete(id);
      await load();
    },
    [load]
  );

  useEffect(() => {
    load();
    return () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      if (intRef.current) clearInterval(intRef.current);
    };
  }, [load]);

  return (
    <div className="container">
      <h1>Voice Memos</h1>

      <div className="row mt-2">
        <button
          className={`btn ${recording ? "btn-danger" : "btn-primary"}`}
          onClick={() => (recording ? stop() : start())}
        >
          {recording ? "■ Stop" : "● Start"}
        </button>

        <span className="pill">
          {status}
          {timer > 0 ? ` — ${formatDuration(timer)}` : ""}
        </span>
      </div>

      {recording && (
        <div className="card mt-2" style={{ background: "#fffbe6" }}>
          <strong className="card-title">
            Listening… {sttRef.current ? "" : "(no STT)"}
          </strong>
          <p className="m-0" style={{ minHeight: 24 }}>
            {partial || "…"}
          </p>
        </div>
      )}

      <h2 className="mt-3">Saved Memos</h2>
      <div className="grid">
        {memos.length === 0 && <p className="subtle">No memos yet.</p>}
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
                  const a = new Audio(url);
                  a.play().catch(() => {});
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }}
              >
                ▶ Play
              </button>

              <button
                className="btn btn-ghost"
                onClick={() => {
                  const url = URL.createObjectURL(m.blob);
                  const a = document.createElement("a");
                  const ext = m.mime?.includes("ogg") ? "ogg" : "webm";
                  a.href = url;
                  a.download = `memo_${new Date(m.created)
                    .toISOString()
                    .replace(/[:.]/g, "-")}.${ext}`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                ⬇ Download
              </button>

              <button className="btn btn-secondary" onClick={() => del(m.id)}>
                🗑 Delete
              </button>
            </div>

            <p className="subtle mt-1">
              {(m.mime || "audio")} • {formatDuration(m.durationMs)}
            </p>

            {m.transcript ? (
              <div className="card mt-1" style={{ background: "#fff7e6" }}>
                <strong className="card-title">Transcript</strong>
                <p className="m-0">{m.transcript}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
