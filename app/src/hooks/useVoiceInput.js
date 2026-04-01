import { useState, useCallback, useRef, useEffect } from "react";

import { API_BASE } from "../config.js";

const MAX_RECORDING_MS = 60_000;

const isSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function useVoiceInput(onTranscription) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const maxDurationTimerRef = useRef(null);

  const stopRecording = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Microphone requires a secure connection (HTTPS). Please access this page via HTTPS or localhost.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(`Microphone access denied: ${err.message}`);
      return;
    }

    let mimeType = "audio/webm;codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "";
      }
    }

    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      setError(`Failed to create MediaRecorder: ${err.message}`);
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      // Stop all tracks to release the microphone
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);

      const chunks = audioChunksRef.current;
      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      audioChunksRef.current = [];

      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        const res = await fetch(`${API_BASE}/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errBody.error || `Transcription failed: ${res.statusText}`);
        }

        const data = await res.json();
        if (onTranscription && data.text) {
          onTranscription(data.text);
        }
      } catch (err) {
        setError(`Transcription error: ${err.message}`);
      } finally {
        setIsTranscribing(false);
      }
    };

    recorder.onerror = (e) => {
      setError(`Recording error: ${e.error?.message || "unknown error"}`);
      setIsRecording(false);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setIsRecording(true);

    // Auto-stop after maximum duration
    maxDurationTimerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_MS);
  }, [onTranscription, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, []);

  return { isRecording, isTranscribing, startRecording, stopRecording, error, isSupported };
}
