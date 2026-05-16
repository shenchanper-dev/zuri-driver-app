/**
 * STT hook — unified interface for web (webkitSpeechRecognition) and
 * native Android/iOS (expo-speech-recognition).
 * Public API is identical on both platforms:
 *   { isSupported, isListening, transcript, error, start, stop, reset }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

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

// Module-level constants — Platform.OS never changes at runtime
const isNative = Platform.OS !== 'web';

// Web: resolve constructor once at module load (same as original behaviour)
const WebRecog = !isNative && typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

export function useSpeechToText(): STTState {
    const [isListening, setIsListening]         = useState(false);
    const [transcript, setTranscript]           = useState('');
    const [error, setError]                     = useState<string | null>(null);
    const [nativeSupported, setNativeSupported] = useState(false);

    // Web: synchronous check (identical to original); Native: set after permission request
    const isSupported = isNative ? nativeSupported : !!WebRecog;

    // ── Web: webkitSpeechRecognition instance ─────────────────────────────
    const recogRef = useRef<any>(null);

    useEffect(() => {
        if (isNative || !WebRecog) return;
        const r = new WebRecog();
        r.lang            = 'es-PE';
        r.continuous      = false;
        r.interimResults  = false;
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
    }, []); // WebRecog is a module-level constant — deps intentionally empty

    // ── Native: request permissions on mount ─────────────────────────────
    useEffect(() => {
        if (!isNative) return;
        ExpoSpeechRecognitionModule.requestPermissionsAsync()
            .then(status => setNativeSupported(status.granted))
            .catch(() => setNativeSupported(false));
    }, []);

    // ── Native: event listeners ───────────────────────────────────────────
    // useSpeechRecognitionEvent is a no-op on web — safe to call unconditionally
    useSpeechRecognitionEvent('result', (event) => {
        if (!isNative) return;
        const text = event.results?.[0]?.transcript || '';
        if (text) setTranscript(text);
    });

    useSpeechRecognitionEvent('error', (event) => {
        if (!isNative) return;
        setError(event.error || 'unknown');
        setIsListening(false);
    });

    useSpeechRecognitionEvent('end', () => {
        if (!isNative) return;
        setIsListening(false);
    });

    // ── start ─────────────────────────────────────────────────────────────
    const start = useCallback(() => {
        if (isListening) return;
        setError(null);
        setTranscript('');
        if (isNative) {
            if (!nativeSupported) return;
            ExpoSpeechRecognitionModule.start({ lang: 'es-PE', continuous: false });
            setIsListening(true);
        } else {
            if (!recogRef.current) return;
            try {
                recogRef.current.start();
                setIsListening(true);
            } catch (e: any) {
                setError(e?.message || 'start failed');
            }
        }
    }, [isListening, nativeSupported]);

    // ── stop ──────────────────────────────────────────────────────────────
    const stop = useCallback(() => {
        if (!isListening) return;
        if (isNative) {
            ExpoSpeechRecognitionModule.stop();
        } else {
            try { recogRef.current?.stop(); } catch { /* ignore */ }
        }
    }, [isListening]);

    // ── reset ─────────────────────────────────────────────────────────────
    const reset = useCallback(() => {
        setTranscript('');
        setError(null);
    }, []);

    return { isSupported, isListening, transcript, error, start, stop, reset };
}
