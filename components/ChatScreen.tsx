'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
    Keyboard,
} from 'react-native';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../constants/theme';
import { chatSocket, MensajeChat } from '../services/chatSocket';
import { useTextToSpeech } from '../hooks/useTextToSpeech';

interface ChatScreenProps {
    servicioId: number;
    conductorId: number;
    conductorNombre: string;
    onClose: () => void;
}

export function ChatScreen({ servicioId, conductorId, conductorNombre, onClose }: ChatScreenProps) {
    const [mensajes, setMensajes]               = useState<MensajeChat[]>([]);
    const [input, setInput]                     = useState('');
    const [conversacionId, setConversacionId]   = useState<number | null>(null);
    const [otroEscribiendo, setOtroEscribiendo] = useState(false);
    const [conectado, setConectado]             = useState(false);
    const [cargando, setCargando]               = useState(true);

    const flatRef             = useRef<FlatList>(null);
    const typingTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentRef   = useRef<number>(0);
    const conversacionIdRef   = useRef<number | null>(null);
    const lastSpokenIdRef     = useRef<number | null>(null);

    const tts = useTextToSpeech();

    // Keep ref in sync so event callbacks have current value without stale closure
    useEffect(() => {
        conversacionIdRef.current = conversacionId;
    }, [conversacionId]);

    // ── Conectar + registrar listeners ────────────────────────────
    useEffect(() => {
        let cancelled = false;

        chatSocket.connect(conductorId, conductorNombre).then((ok) => {
            if (cancelled) return;
            setConectado(ok);
            if (ok) {
                chatSocket.join(servicioId);
            } else {
                setCargando(false);
            }
        });

        const onHistory = (data: { conversacionId: number; mensajes: MensajeChat[] }) => {
            if (cancelled) return;
            setConversacionId(data.conversacionId);
            setMensajes(data.mensajes);
            setCargando(false);
            const ultimo = [...data.mensajes].reverse().find(m => m.autor_tipo === 'ADMIN');
            if (ultimo) chatSocket.markRead(data.conversacionId, ultimo.id);
        };

        const onNewMessage = ({ mensaje }: { mensaje: MensajeChat }) => {
            if (cancelled) return;
            setMensajes(prev => {
                if (prev.some(m => m.id === mensaje.id)) return prev;
                return [...prev, mensaje];
            });
            if (mensaje.autor_tipo === 'ADMIN' && conversacionIdRef.current) {
                chatSocket.markRead(conversacionIdRef.current, mensaje.id);
            }
        };

        const onReadUpdate = ({ hasta, lectorTipo }: { hasta: number; lectorTipo: string }) => {
            if (cancelled || lectorTipo === 'CONDUCTOR') return;
            setMensajes(prev => prev.map(m =>
                m.id <= hasta && m.autor_tipo === 'CONDUCTOR' && !m.leido_en
                    ? { ...m, leido_en: new Date().toISOString() }
                    : m
            ));
        };

        const onTyping = ({ autorTipo, isTyping }: { autorTipo: string; isTyping: boolean }) => {
            if (cancelled) return;
            if (autorTipo === 'ADMIN') setOtroEscribiendo(isTyping);
        };

        chatSocket.on('chat:history',     onHistory);
        chatSocket.on('chat:message:new', onNewMessage);
        chatSocket.on('chat:read:update', onReadUpdate);
        chatSocket.on('chat:typing',      onTyping);

        return () => {
            cancelled = true;
            chatSocket.off('chat:history',     onHistory);
            chatSocket.off('chat:message:new', onNewMessage);
            chatSocket.off('chat:read:update', onReadUpdate);
            chatSocket.off('chat:typing',      onTyping);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, [servicioId, conductorId, conductorNombre]);

    // ── Auto-scroll ───────────────────────────────────────────────
    useEffect(() => {
        if (mensajes.length > 0 || otroEscribiendo) {
            setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60);
        }
    }, [mensajes.length, otroEscribiendo]);

    // ── TTS: leer mensajes de Zuri AI ─────────────────────────────
    useEffect(() => {
        if (!tts.isSupported || !tts.enabled || mensajes.length === 0) return;
        const last = mensajes[mensajes.length - 1];
        if (
            last.autor_tipo === 'SISTEMA' &&
            last.autor_nombre === 'Zuri AI' &&
            last.id !== lastSpokenIdRef.current
        ) {
            lastSpokenIdRef.current = last.id;
            const limpio = last.contenido.replace(/^🤖\s*Zuri:\s*/, '').trim();
            if (limpio) tts.speak(limpio);
        }
    }, [mensajes, tts]);

    // ── Typing con throttle 1.5 s ─────────────────────────────────
    const handleInputChange = (text: string) => {
        setInput(text);
        const now = Date.now();
        if (now - lastTypingSentRef.current > 1500) {
            chatSocket.setTyping(servicioId, true);
            lastTypingSentRef.current = now;
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            chatSocket.setTyping(servicioId, false);
            lastTypingSentRef.current = 0;
        }, 2000);
    };

    const handleSend = useCallback(() => {
        const texto = input.trim();
        if (!texto || !conectado || texto.length > 2000) return;
        const ok = chatSocket.sendMessage(servicioId, texto);
        if (ok) {
            setInput('');
            chatSocket.setTyping(servicioId, false);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            Keyboard.dismiss();
        }
    }, [input, conectado, servicioId]);

    // ── Render ────────────────────────────────────────────────────
    return (
        <KeyboardAvoidingView
            style={s.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity
                    style={s.headerBack}
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={s.headerBackTx}>‹</Text>
                </TouchableOpacity>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>Despacho ZURI</Text>
                    <View style={s.headerStatusRow}>
                        <View style={[s.headerDot, conectado ? s.dotOnline : s.dotOffline]} />
                        <Text style={s.headerStatusTx}>
                            {conectado ? 'En línea · responde rápido' : 'Desconectado · reintentando…'}
                        </Text>
                    </View>
                </View>
                {tts.isSupported ? (
                    <TouchableOpacity
                        style={s.headerRight}
                        onPress={tts.toggle}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Text style={[s.headerBackTx, !tts.enabled && { opacity: 0.4 }]}>
                            {tts.isSpeaking ? '🔊' : tts.enabled ? '🔉' : '🔇'}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={s.headerRight} />
                )}
            </View>

            {/* Mensajes */}
            {cargando ? (
                <View style={s.loadingBox}>
                    <ActivityIndicator size="small" color={COLORS.textMuted} />
                    <Text style={s.loadingTx}>Cargando conversación…</Text>
                </View>
            ) : (
                <FlatList
                    ref={flatRef}
                    data={mensajes}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => <Bubble mensaje={item} />}
                    contentContainerStyle={s.listContent}
                    onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
                    ListEmptyComponent={
                        <View style={s.emptyBox}>
                            <Text style={s.emptyTitle}>Sin mensajes aún</Text>
                            <Text style={s.emptySub}>
                                Envía un mensaje al despacho cuando lo necesites.
                            </Text>
                        </View>
                    }
                    ListFooterComponent={
                        otroEscribiendo ? (
                            <View style={s.typingBox}>
                                <Text style={s.typingTx}>Despacho está escribiendo…</Text>
                            </View>
                        ) : null
                    }
                />
            )}

            {/* Input */}
            <View style={s.inputBar}>
                <TextInput
                    style={s.input}
                    value={input}
                    onChangeText={handleInputChange}
                    placeholder="Escribe un mensaje…"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    maxLength={2000}
                    editable={conectado}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    blurOnSubmit={false}
                />
                <TouchableOpacity
                    style={[s.btnSend, (!input.trim() || !conectado) && s.btnSendDisabled]}
                    onPress={handleSend}
                    disabled={!input.trim() || !conectado}
                    activeOpacity={0.85}
                >
                    <Text style={s.btnSendTx}>→</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

// ─── Bubble ──────────────────────────────────────────────────────────────────
function Bubble({ mensaje }: { mensaje: MensajeChat }) {
    const esMio = mensaje.autor_tipo === 'CONDUCTOR';
    const hora  = new Date(mensaje.enviado_en).toLocaleTimeString('es-PE', {
        hour: '2-digit', minute: '2-digit', hour12: false,
    });

    if (mensaje.autor_tipo === 'SISTEMA') {
        return (
            <View style={s.systemBox}>
                <Text style={s.systemTx}>{mensaje.contenido}</Text>
            </View>
        );
    }

    return (
        <View style={[s.bubbleRow, esMio ? s.bubbleRowMine : s.bubbleRowOther]}>
            <View style={[s.bubble, esMio ? s.bubbleMine : s.bubbleOther]}>
                <Text style={[s.bubbleTx, esMio ? s.bubbleTxMine : s.bubbleTxOther]}>
                    {mensaje.contenido}
                </Text>
                <View style={s.bubbleMeta}>
                    <Text style={[s.bubbleHora, esMio ? s.bubbleHoraMine : s.bubbleHoraOther]}>
                        {hora}
                    </Text>
                    {esMio && (
                        <Text style={s.bubbleCheck}>
                            {mensaje.leido_en ? '✓✓' : '✓'}
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.surface,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.accent,
        paddingTop: Platform.OS === 'web' ? SPACING[3] : 50,
        paddingBottom: SPACING[3],
        paddingHorizontal: SPACING[3],
        ...SHADOW.elevated,
    },
    headerBack: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerBackTx: {
        color: COLORS.textOnDark,
        fontSize: 36,
        fontWeight: '300',
        lineHeight: 40,
    },
    headerCenter: { flex: 1 },
    headerTitle: {
        color: COLORS.textOnDark,
        fontSize: FONT.sizes.lg,
        fontWeight: FONT.weights.bold,
    },
    headerStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        gap: 6,
    },
    headerDot: { width: 8, height: 8, borderRadius: 4 },
    dotOnline:  { backgroundColor: COLORS.success },
    dotOffline: { backgroundColor: COLORS.warning },
    headerStatusTx: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: FONT.sizes.xs,
    },
    headerRight: { width: 40 },

    // Lista
    listContent: {
        paddingVertical: SPACING[3],
        paddingHorizontal: SPACING[3],
        flexGrow: 1,
    },
    loadingBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: SPACING[2],
    },
    loadingTx: {
        color: COLORS.textMuted,
        fontSize: FONT.sizes.sm,
        marginTop: SPACING[2],
    },
    emptyBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: SPACING[10],
        paddingHorizontal: SPACING[6],
    },
    emptyTitle: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.semibold,
        color: COLORS.textPrimary,
    },
    emptySub: {
        fontSize: FONT.sizes.sm,
        color: COLORS.textMuted,
        marginTop: 4,
        textAlign: 'center',
    },

    // Bubbles
    bubbleRow: {
        flexDirection: 'row',
        marginBottom: SPACING[2],
    },
    bubbleRowMine:  { justifyContent: 'flex-end' },
    bubbleRowOther: { justifyContent: 'flex-start' },
    bubble: {
        maxWidth: '80%',
        paddingHorizontal: SPACING[3],
        paddingTop: SPACING[2],
        paddingBottom: 6,
        borderRadius: 18,
    },
    bubbleMine: {
        backgroundColor: COLORS.accent,
        borderBottomRightRadius: 4,
    },
    bubbleOther: {
        backgroundColor: COLORS.card,
        borderBottomLeftRadius: 4,
        ...SHADOW.card,
    },
    bubbleTx: {
        fontSize: FONT.sizes.base,
        lineHeight: 22,
    },
    bubbleTxMine:  { color: COLORS.textOnDark },
    bubbleTxOther: { color: COLORS.textPrimary },
    bubbleMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 3,
        gap: 3,
    },
    bubbleHora:      { fontSize: 10 },
    bubbleHoraMine:  { color: 'rgba(255,255,255,0.55)' },
    bubbleHoraOther: { color: COLORS.textMuted },
    bubbleCheck: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
    },

    // Mensaje de sistema (centrado)
    systemBox: {
        alignItems: 'center',
        marginVertical: SPACING[2],
    },
    systemTx: {
        fontSize: FONT.sizes.xs,
        color: COLORS.textMuted,
        backgroundColor: COLORS.surfaceAlt,
        paddingHorizontal: SPACING[3],
        paddingVertical: 4,
        borderRadius: RADIUS.pill,
    },

    // Typing indicator
    typingBox: {
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
    },
    typingTx: {
        fontSize: FONT.sizes.xs,
        color: COLORS.textMuted,
        fontStyle: 'italic',
    },

    // Input bar
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: SPACING[2],
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
        paddingBottom: Platform.OS === 'web' ? SPACING[3] : SPACING[5],
        backgroundColor: COLORS.card,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    input: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING[3],
        paddingVertical: 10,
        maxHeight: 120,
        fontSize: FONT.sizes.base,
        color: COLORS.textPrimary,
    },
    btnSend: {
        width: 44, height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnSendDisabled: { opacity: 0.35 },
    btnSendTx: {
        color: COLORS.textOnDark,
        fontSize: 22,
        fontWeight: FONT.weights.bold,
        marginTop: -1,
    },
});
