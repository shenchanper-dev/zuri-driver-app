/**
 * STT via Web Speech API (webkitSpeechRecognition).
 * Solo web (Chrome Android, Chrome/Edge desktop). En APK nativa,
 * isSupported=false y los métodos son no-ops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface STTState {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export function useSpeechToText(): STTState {
  const isWeb = Platform.OS === 'web';
  const Recog =
    isWeb && typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
  const isSupported = !!Recog;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript]   = useState('');
  const [error, setError]             = useState<string | null>(null);

  const recogRef = useRef<any>(null);

  useEffect(() => {
    if (!Recog) return;
    const r = new Recog();
    r.lang = 'es-PE';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      if (text) setTranscript(text);
    };
    r.onerror = (e: any) => {
      setError(e?.error || 'unknown');
      setIsListening(false);
    };
    r.onend = () => setIsListening(false);

    recogRef.current = r;
    return () => {
      try { r.stop(); } catch { /* ignore */ }
      recogRef.current = null;
    };
  }, [Recog]);

  const start = useCallback(() => {
    if (!recogRef.current || isListening) return;
    setError(null);
    setTranscript('');
    try {
      recogRef.current.start();
      setIsListening(true);
    } catch (e: any) {
      setError(e?.message || 'start failed');
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (!recogRef.current || !isListening) return;
    try { recogRef.current.stop(); } catch { /* ignore */ }
  }, [isListening]);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return { isSupported, isListening, transcript, error, start, stop, reset };
}
