import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Modal, View, Text, TouchableOpacity,
    ActivityIndicator, Alert, StyleSheet,
    Animated, Vibration,
} from 'react-native';
import { driverApi } from '@/services/api';
import type { AsignacionProgramacion } from '@/types/servicios';
import { COLORS, FONT, SPACING, RADIUS, SHADOW, DURATION } from '../constants/theme';

// Defined locally — not in theme.ts (domain-specific constant)
const TIMEOUT_ASIGNACION_MS = 45_000;
const TIMER_TOTAL = TIMEOUT_ASIGNACION_MS / 1000;

interface Props {
    visible: boolean;
    asignacion: AsignacionProgramacion | null;
    onAceptado: (asignacion: AsignacionProgramacion) => void;
}

function GridItem({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <View style={s.gridItem}>
            <Text style={s.gridLabel}>{icon}  {label}</Text>
            <Text style={s.gridValue} numberOfLines={2}>{value}</Text>
        </View>
    );
}

export function ServicioModal({ visible, asignacion, onAceptado }: Props) {
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIMER_TOTAL);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.96)).current;

    // ── Countdown ────────────────────────────────────────────────────────────
    const resetTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(TIMER_TOTAL);
    }, []);

    useEffect(() => {
        if (!visible || !asignacion) {
            resetTimer();
            return;
        }

        // Entrance animation
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: DURATION.slow, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
        ]).start();

        // Vibration on appear
        Vibration.vibrate([0, 500, 200, 500]);

        // Countdown
        setTimeLeft(TIMER_TOTAL);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current!);
                    return 0;
                }
                // Repeat vibration every 15s
                if (prev % 15 === 0) Vibration.vibrate([0, 300, 150, 300]);
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            Vibration.cancel();
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.96);
        };
    }, [visible, asignacion?.id]);

    // ── Auto-close when timer hits 0 ────────────────────────────────────────
    useEffect(() => {
        if (timeLeft === 0 && visible) {
            // Backend handles re-assignment; just close modal
            resetTimer();
        }
    }, [timeLeft]);

    if (!asignacion) return null;

    const turnoLabel = asignacion.turno ? `Turno ${asignacion.turno}` : 'Sin turno';
    const horaStr = `${asignacion.horaInicio?.slice(0, 5) ?? ''}–${asignacion.horaFin?.slice(0, 5) ?? ''}`;

    // Timer color transitions: accent → warning → danger
    const timerColor =
        timeLeft > 15 ? COLORS.accent :
        timeLeft > 10 ? COLORS.warning :
                        COLORS.danger;

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleAceptar = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await driverApi.responderProgramacion(asignacion.id, 'ACEPTAR');
            if (res.success) {
                Vibration.cancel();
                resetTimer();
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

    const handleRechazar = () => {
        Alert.prompt(
            '¿Por qué rechazas el servicio?',
            'Escribe el motivo del rechazo (requerido):',
            async (motivo) => {
                if (!motivo?.trim()) {
                    Alert.alert('Motivo requerido', 'Por favor escribe un motivo antes de rechazar.');
                    return;
                }
                try {
                    setLoading(true);
                    await driverApi.responderProgramacion(asignacion.id, 'RECHAZAR', motivo.trim());
                    Vibration.cancel();
                    resetTimer();
                    onAceptado(asignacion); // closes modal / advances queue
                } catch {
                    Alert.alert('Error', 'No se pudo registrar el rechazo.');
                } finally {
                    setLoading(false);
                }
            },
            'plain-text'
        );
    };

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
            <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
                <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }] }]}>

                    {/* Badge + Timer row */}
                    <View style={s.topRow}>
                        <View style={s.badge}>
                            <Text style={s.badgeText}>NUEVO SERVICIO</Text>
                        </View>
                        <View style={[s.timerCircle, { borderColor: timerColor }]}>
                            <Text style={[s.timerNumber, { color: timerColor }]}>{timeLeft}</Text>
                            <Text style={[s.timerSeg, { color: timerColor }]}>seg</Text>
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

                    {/* Accept button */}
                    <TouchableOpacity
                        style={[s.btnAceptar, loading && s.btnDisabled]}
                        onPress={handleAceptar}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        {loading
                            ? <ActivityIndicator color={COLORS.textOnDark} size="small" />
                            : <Text style={s.btnAceptarText}>ACEPTAR SERVICIO</Text>
                        }
                    </TouchableOpacity>

                    {/* Nag countdown info */}
                    <Text style={s.nagInfo}>
                        Si no respondes en {timeLeft}s, el servicio se reasignará automáticamente
                    </Text>

                    {/* Reject link */}
                    <TouchableOpacity
                        style={s.btnRechazar}
                        onPress={handleRechazar}
                        disabled={loading}
                        activeOpacity={0.7}
                    >
                        <Text style={s.btnRechazarText}>Rechazar servicio</Text>
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

    // Badge + Timer
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING[4],
    },
    badge: {
        flex: 1,
        marginRight: SPACING[3],
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
    timerCircle: {
        width: 56,
        height: 56,
        borderRadius: RADIUS.pill,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
    },
    timerNumber: {
        fontSize: FONT.sizes.lg,
        fontWeight: FONT.weights.bold,
        lineHeight: 20,
    },
    timerSeg: {
        fontSize: 9,
        fontWeight: FONT.weights.semibold,
        letterSpacing: 0.5,
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

    // Accept button
    btnAceptar: {
        backgroundColor: COLORS.primary,
        height: 52,
        borderRadius: RADIUS.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: SPACING[4],
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

    // Nag info
    nagInfo: {
        textAlign: 'center',
        color: COLORS.textMuted,
        fontSize: FONT.sizes.xs,
        marginTop: SPACING[3],
        lineHeight: 16,
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
