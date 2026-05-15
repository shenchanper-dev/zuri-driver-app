/**
 * TTS dual: Web Speech API en navegador, expo-speech en APK nativo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

const VOICE_PREFERENCE = ['Paulina', 'Helena', 'Mónica', 'Google español', 'Microsoft Sabina'];
const STORAGE_KEY = 'zuri.tts.enabled';

interface TTSState {
    isSupported: boolean;
    isSpeaking: boolean;
    enabled: boolean;
    speak: (text: string) => void;
    stop: () => void;
    toggle: () => void;
}

export function useTextToSpeech(): TTSState {
    const isWeb = Platform.OS === 'web';
    const synth = isWeb && typeof window !== 'undefined' ? window.speechSynthesis : null;
    // Web: depende de speechSynthesis. Native: expo-speech siempre disponible.
    const isSupported = isWeb ? !!synth : true;

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [enabled, setEnabled] = useState<boolean>(() => {
        if (isWeb && typeof localStorage !== 'undefined') {
            const v = localStorage.getItem(STORAGE_KEY);
            return v === null ? true : v === '1';
        }
        return true;
    });

    const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

    // ── Web: cargar voces ────────────────────────────────────────────
    useEffect(() => {
        if (!synth) return;
        const pickVoice = () => {
            const voices = synth.getVoices();
            const esVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
            for (const name of VOICE_PREFERENCE) {
                const match = esVoices.find(v => v.name.includes(name));
                if (match) { voiceRef.current = match; return; }
            }
            voiceRef.current = esVoices[0] || voices[0] || null;
        };
        pickVoice();
        synth.onvoiceschanged = pickVoice;
        return () => { if (synth) synth.onvoiceschanged = null; };
    }, [synth]);

    // ── Native: leer preferencia persistida ──────────────────────────
    useEffect(() => {
        if (isWeb) return;
        AsyncStorage.getItem(STORAGE_KEY).then(v => {
            if (v !== null) setEnabled(v === '1');
        }).catch(() => {});
    }, [isWeb]);

    const stop = useCallback(() => {
        if (isWeb) {
            if (synth) {
                synth.cancel();
                setIsSpeaking(false);
            }
        } else {
            Speech.stop().catch(() => {});
            setIsSpeaking(false);
        }
    }, [isWeb, synth]);

    const speak = useCallback((text: string) => {
        if (!enabled || !text?.trim()) return;
        const clean = text.trim();

        if (isWeb) {
            if (!synth) return;
            synth.cancel();
            const utter = new SpeechSynthesisUtterance(clean);
            utter.lang = 'es-PE';
            utter.rate = 1.0;
            utter.pitch = 1.0;
            utter.volume = 1.0;
            if (voiceRef.current) utter.voice = voiceRef.current;
            utter.onstart = () => setIsSpeaking(true);
            utter.onend = () => setIsSpeaking(false);
            utter.onerror = () => setIsSpeaking(false);
            synth.speak(utter);
        } else {
            Speech.stop().catch(() => {});
            Speech.speak(clean, {
                language: 'es-PE',
                pitch: 1.0,
                rate: 1.0,
                onStart: () => setIsSpeaking(true),
                onDone: () => setIsSpeaking(false),
                onStopped: () => setIsSpeaking(false),
                onError: () => setIsSpeaking(false),
            });
        }
    }, [isWeb, synth, enabled]);

    const toggle = useCallback(() => {
        setEnabled(prev => {
            const next = !prev;
            if (isWeb && typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
            } else if (!isWeb) {
                AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0').catch(() => {});
            }
            if (!next) {
                if (synth) synth.cancel();
                if (!isWeb) Speech.stop().catch(() => {});
            }
            return next;
        });
    }, [isWeb, synth]);

    return { isSupported, isSpeaking, enabled, speak, stop, toggle };
}
