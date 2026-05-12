/**
 * TTS via Web Speech API — solo web (Chrome Android, navegadores desktop).
 * En APK nativa los métodos son no-ops y isSupported=false.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

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
  const isSupported = !!synth;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!isWeb || typeof localStorage === 'undefined') return true;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  });

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Cargar voces (async en algunos navegadores)
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

  const stop = useCallback(() => {
    if (!synth) return;
    synth.cancel();
    setIsSpeaking(false);
  }, [synth]);

  const speak = useCallback((text: string) => {
    if (!synth || !enabled || !text?.trim()) return;
    synth.cancel(); // evitar overlap

    const utter = new SpeechSynthesisUtterance(text.trim());
    utter.lang = 'es-PE';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    if (voiceRef.current) utter.voice = voiceRef.current;

    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);

    synth.speak(utter);
  }, [synth, enabled]);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      if (isWeb && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      }
      if (!next && synth) synth.cancel();
      return next;
    });
  }, [isWeb, synth]);

  return { isSupported, isSpeaking, enabled, speak, stop, toggle };
}
