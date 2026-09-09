import React, { useState, useEffect, useRef } from 'react';
import {
    Modal, View, Text, TouchableOpacity, Platform,
    ActivityIndicator, Alert, StyleSheet,
    Animated, Vibration,
} from 'react-native';
import { driverApi } from '@/services/api';
import type { AsignacionProgramacion } from '@/types/servicios';
import { COLORS, FONT, SPACING, RADIUS, SHADOW, DURATION } from '../constants/theme';

interface Props {
    visible: boolean;
    asignacion: AsignacionProgramacion | null;
    onAceptado: (asignacion: AsignacionProgramacion) => void;
    onClose?: () => void;
}

function GridItem({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <View style={s.gridItem}>
            <Text style={s.gridLabel}>{icon}  {label}</Text>
            <Text style={s.gridValue} numberOfLines={2}>{value}</Text>
        </View>
    );
}

export function ServicioModal({ visible, asignacion, onAceptado, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [realState, setRealState] = useState<'ASIGNADO' | 'ACEPTADO' | null>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.96)).current;

    // ── Entrance animation + vibration ───────────────────────────────────────
    useEffect(() => {
        if (!visible || !asignacion) return;

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: DURATION.slow, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
        ]).start();

        Vibration.vibrate([0, 500, 200, 500]);

        return () => {
            Vibration.cancel();
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.96);
        };
    }, [visible, asignacion?.id]);

    // ── Detect real state of the service before showing action button ────────
    useEffect(() => {
        if (!visible || !asignacion) {
            setRealState(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await driverApi.getServices();
                if (cancelled) return;
                const found = (res.servicios ?? []).find(
                    (s: any) => s.id === asignacion.id && s.fuente === 'PROGRAMACION'
                );
                if (found?.estado === 'ACEPTADO') {
                    setRealState('ACEPTADO');
                } else if (found?.estado === 'ASIGNADO') {
                    setRealState('ASIGNADO');
                }
                // else: leave null → fallback to ACEPTAR button
            } catch {
                // network error → leave null → safe fallback (ACEPTAR button)
            }
        })();
        return () => { cancelled = true; };
    }, [visible, asignacion?.id]);

    if (!asignacion) return null;

    const turnoLabel = asignacion.turno ? `Turno ${asignacion.turno}` : 'Sin turno';
    const horaStr = `${asignacion.horaInicio?.slice(0, 5) ?? ''}–${asignacion.horaFin?.slice(0, 5) ?? ''}`;

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleAceptar = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await driverApi.responderProgramacion(asignacion.id, 'ACEPTAR');
            if (res.success) {
                Vibration.cancel();
                onAceptado(asignacion);
            } else {
                Alert.alert('Error', res.error || 'No se pudo aceptar. Intenta nuevamente.');
            }
        } catch {
            Alert.alert('Sin conexión', 'Verifica tu internet e intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    // driverApi.avanzarProgramacion handles EN_CAMINO (responderProgramacion only covers ACEPTAR/RECHAZAR)
    const handleIrEnCamino = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await driverApi.avanzarProgramacion(asignacion.id, 'EN_CAMINO');
            if (res.success) {
                Vibration.cancel();
                onAceptado(asignacion);
            } else {
                Alert.alert('Error', res.error || 'No se pudo actualizar el estado. Intenta nuevamente.');
            }
        } catch {
            Alert.alert('Sin conexión', 'Verifica tu internet e intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };
    const handleRechazar = () => {
        const doRechazar = async (motivo: string) => {
            try {
                setLoading(true);
                await driverApi.responderProgramacion(asignacion.id, "RECHAZAR", motivo.trim());
                Vibration.cancel();
                onAceptado(asignacion);
            } catch {
                Alert.alert("Error", "No se pudo registrar el rechazo.");
            } finally {
                setLoading(false);
            }
        };
        if (Platform.OS === "ios") {
            Alert.prompt(
                "¿Por qué rechazas el servicio?",
                "Escribe el motivo del rechazo:",
                async (motivo) => {
                    if (!motivo?.trim()) {
                        Alert.alert("Motivo requerido", "Escribe un motivo antes de rechazar.");
                        return;
                    }
                    await doRechazar(motivo);
                },
                "plain-text"
            );
        } else {
            Alert.alert(
                "Cerrar",
                "¿Estás seguro de rechazar este servicio?",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Rechazar", style: "destructive", onPress: () => doRechazar("Rechazado por conductor") },
                ]
            );
        }
    };
    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
            <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
                <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }] }]}>

                    {/* Badge row */}
                    <View style={s.topRow}>
                        <View style={s.badge}>
                            <Text style={s.badgeText}>SERVICIO ASIGNADO</Text>
                        {onClose && (
                            <TouchableOpacity onPress={onClose} style={{ position: "absolute", top: -8, right: -8, width: 32, height: 32, borderRadius: 16, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", zIndex: 10 }} activeOpacity={0.7}>
                                <Text style={{ fontSize: 18, color: "#64748b", fontWeight: "700" }}>✕</Text>
                            </TouchableOpacity>
                        )}
                        </View>
                    </View>

                    {/* Doctor name — prominent title */}
                    <Text style={s.medico} numberOfLines={2}>
                        Dr. {asignacion.doctor}
                    </Text>

                    <View style={s.sep} />

                    {/* Info grid — 2 columns */}
                    <View style={s.grid}>
                        <GridItem icon="👨‍⚕️" label="Doctor"  value={asignacion.doctor} />
                        <GridItem icon="🕐"   label="Horario" value={`${turnoLabel} · ${horaStr}`} />
                        {asignacion.cliente ? (
                            <GridItem icon="🏥" label="Cliente" value={asignacion.cliente} />
                        ) : (
                            <View style={s.gridItem} />
                        )}
                        {asignacion.distrito ? (
                            <GridItem icon="📍" label="Distrito" value={asignacion.distrito} />
                        ) : null}
                    </View>

                    {/* Ubicación (if distinct from distrito) */}
                    {asignacion.ubicacion && asignacion.ubicacion !== asignacion.distrito ? (
                        <Text style={s.ubicacion}>🗺  {asignacion.ubicacion}</Text>
                    ) : null}

                    {/* Meta pills */}
                    {(asignacion.tipoServicio || asignacion.tipoCreacion || asignacion.codigo) ? (
                        <View style={s.pillRow}>
                            {asignacion.tipoServicio ? (
                                <View style={s.pill}>
                                    <Text style={s.pillTx}>{asignacion.tipoServicio}</Text>
                                </View>
                            ) : null}
                            {asignacion.tipoCreacion ? (
                                <View style={[s.pill, s.pillAlt]}>
                                    <Text style={[s.pillTx, s.pillTxAlt]}>
                                        {asignacion.tipoCreacion === 'AUTOMATICO' ? '⚡ Auto' : '✏️ Manual'}
                                    </Text>
                                </View>
                            ) : null}
                            {asignacion.codigo ? (
                                <View style={[s.pill, s.pillAlt]}>
                                    <Text style={[s.pillTx, s.pillTxAlt]}>{asignacion.codigo}</Text>
                                </View>
                            ) : null}
                        </View>
                    ) : null}

                    <View style={s.sep} />

                    {/* Action button — EN_CAMINO if already accepted, ACEPTAR otherwise */}
                    {realState === 'ACEPTADO' ? (
                        <TouchableOpacity
                            style={[s.btnAceptar, s.btnEnCamino, loading && s.btnDisabled]}
                            onPress={handleIrEnCamino}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            {loading
                                ? <ActivityIndicator color={COLORS.textOnDark} size="small" />
                                : <Text style={s.btnAceptarText}>🚗  IR EN CAMINO</Text>
                            }
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[s.btnAceptar, loading && s.btnDisabled]}
                            onPress={() => { Vibration.cancel(); onAceptado(asignacion); }}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            {loading
                                ? <ActivityIndicator color={COLORS.textOnDark} size="small" />
                                : <Text style={s.btnAceptarText}>VER SERVICIO</Text>
                            }
                        </TouchableOpacity>
                    )}

                    {/* Reject link */}
                    <TouchableOpacity
                        style={s.btnRechazar}
                        onPress={onClose || (() => { Vibration.cancel(); onAceptado(asignacion); })}
                        disabled={loading}
                        activeOpacity={0.7}
                    >
                        <Text style={s.btnRechazarText}>Cerrar</Text>
                    </TouchableOpacity>

                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const s = StyleSheet.create({
    // Overlay — dark bg, bottom-sheet alignment
    overlay: {
        flex: 1,
        backgroundColor: COLORS.overlay,
        justifyContent: 'flex-end',
    },

    // Card — bottom sheet
    card: {
        backgroundColor: COLORS.card,
        borderTopLeftRadius:  RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        paddingHorizontal: SPACING[6],
        paddingTop: SPACING[6],
        paddingBottom: SPACING[8],
        ...SHADOW.modal,
    },

    // Badge row
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING[4],
    },
    badge: {
        alignSelf: 'center',
        backgroundColor: COLORS.warning,
        borderRadius: RADIUS.pill,
        paddingHorizontal: SPACING[4],
        paddingVertical: SPACING[1],
    },
    badgeText: {
        fontSize: FONT.sizes.xs,
        fontWeight: FONT.weights.bold,
        color: COLORS.textPrimary,
        letterSpacing: 1,
    },

    // Doctor title
    medico: {
        fontSize: FONT.sizes.xl,
        fontWeight: FONT.weights.bold,
        color: COLORS.textPrimary,
        marginBottom: SPACING[4],
        lineHeight: 28,
    },

    // Separator
    sep: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING[3],
    },

    // Info grid — 2 columns
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING[4],
        marginBottom: SPACING[2],
    },
    gridItem: {
        width: '47%',
        gap: 3,
    },
    gridLabel: {
        fontSize: FONT.sizes.xs,
        color: COLORS.textMuted,
        marginBottom: 2,
    },
    gridValue: {
        fontSize: FONT.sizes.sm,
        fontWeight: FONT.weights.semibold,
        color: COLORS.textPrimary,
        lineHeight: 19,
    },

    // Ubicación
    ubicacion: {
        fontSize: FONT.sizes.sm,
        color: COLORS.textSecondary,
        marginTop: SPACING[1],
        marginBottom: SPACING[2],
    },

    // Meta pills
    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING[2],
        marginTop: SPACING[2],
    },
    pill: {
        backgroundColor: COLORS.infoBg,
        paddingHorizontal: SPACING[3],
        paddingVertical: 4,
        borderRadius: RADIUS.pill,
    },
    pillAlt: {
        backgroundColor: COLORS.surface,
    },
    pillTx: {
        fontSize: FONT.sizes.xs,
        fontWeight: FONT.weights.semibold,
        color: COLORS.info,
    },
    pillTxAlt: {
        color: COLORS.textSecondary,
    },

    // Accept / En camino button
    btnAceptar: {
        backgroundColor: COLORS.primary,
        height: 52,
        borderRadius: RADIUS.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: SPACING[4],
    },
    btnEnCamino: {
        backgroundColor: COLORS.accent,
    },
    btnDisabled: {
        backgroundColor: COLORS.borderStrong,
    },
    btnAceptarText: {
        color: COLORS.textOnDark,
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.bold,
        letterSpacing: 0.5,
    },

    // Reject link
    btnRechazar: {
        alignItems: 'center',
        paddingTop: SPACING[3],
        paddingBottom: SPACING[2],
    },
    btnRechazarText: {
        fontSize: FONT.sizes.sm,
        color: COLORS.textMuted,
    },
});

/* COUNTDOWN_REF_S29 — Referencia para nemt.zuri.pe (no eliminar)
 *
 * Countdown de 45 segundos removido en S29 para reducir presión al conductor.
 * Conservado aquí para reimplementar en nemt.zuri.pe si se requiere presión de tiempo.
 *
 * import { useCallback } from 'react';
 * const TIMEOUT_ASIGNACION_MS = 45_000;
 * const TIMER_TOTAL = TIMEOUT_ASIGNACION_MS / 1000;
 *
 * // Estado y ref:
 * const [timeLeft, setTimeLeft] = useState(TIMER_TOTAL);
 * const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 *
 * // Reset helper:
 * const resetTimer = useCallback(() => {
 *     if (timerRef.current) clearInterval(timerRef.current);
 *     setTimeLeft(TIMER_TOTAL);
 * }, []);
 *
 * // Dentro del useEffect principal, después de Vibration.vibrate():
 * setTimeLeft(TIMER_TOTAL);
 * timerRef.current = setInterval(() => {
 *     setTimeLeft(prev => {
 *         if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
 *         if (prev % 15 === 0) Vibration.vibrate([0, 300, 150, 300]);
 *         return prev - 1;
 *     });
 * }, 1000);
 * // cleanup: if (timerRef.current) clearInterval(timerRef.current);
 *
 * // Auto-close effect:
 * useEffect(() => {
 *     if (timeLeft === 0 && visible) resetTimer();
 * }, [timeLeft]);
 *
 * // Timer color:
 * const timerColor = timeLeft > 15 ? COLORS.accent : timeLeft > 10 ? COLORS.warning : COLORS.danger;
 *
 * // JSX — dentro de topRow, a la derecha del badge:
 * <View style={[s.timerCircle, { borderColor: timerColor }]}>
 *     <Text style={[s.timerNumber, { color: timerColor }]}>{timeLeft}</Text>
 *     <Text style={[s.timerSeg, { color: timerColor }]}>seg</Text>
 * </View>
 *
 * // JSX — entre btnAceptar y btnRechazar:
 * <Text style={s.nagInfo}>
 *     Si no respondes en {timeLeft}s, el servicio se reasignará automáticamente
 * </Text>
 *
 * // Styles:
 * timerCircle: { width: 56, height: 56, borderRadius: RADIUS.pill, borderWidth: 3,
 *     alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
 * timerNumber: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, lineHeight: 20 },
 * timerSeg: { fontSize: 9, fontWeight: FONT.weights.semibold, letterSpacing: 0.5 },
 * nagInfo: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizes.xs,
 *     marginTop: SPACING[3], lineHeight: 16 },
 *
 * // En handlers, antes de onAceptado():
 * resetTimer();
 */
