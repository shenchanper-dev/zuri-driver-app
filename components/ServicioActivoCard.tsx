import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
    ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { driverApi } from '@/services/api';
import type { Servicio } from '@/types/servicios';
import { BADGE_CONFIG, ACCENT_COLOR, AVANCE_CONFIG } from '@/types/servicios';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';

const PASOS_ESTADO = ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO', 'COMPLETADO'] as const;

interface Props {
    servicio: Servicio;
    onActualizado: () => void;
}

/** Compact horizontal stepper */
function Stepper({ estado }: { estado: string }) {
    const currentIdx = PASOS_ESTADO.indexOf(estado as typeof PASOS_ESTADO[number]);
    return (
        <View style={st.stepper}>
            {PASOS_ESTADO.map((paso, idx) => {
                const done = idx < currentIdx;
                const current = idx === currentIdx;
                return (
                    <React.Fragment key={paso}>
                        <View style={[
                            st.dot,
                            done && st.dotDone,
                            current && st.dotCurrent,
                        ]} />
                        {idx < PASOS_ESTADO.length - 1 && (
                            <View style={[st.line, done && st.lineDone]} />
                        )}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

export function ServicioActivoCard({ servicio, onActualizado }: Props) {
    const [loading, setLoading] = useState(false);

    const badge = BADGE_CONFIG[servicio.estado] ?? { bg: '#F4F5F7', text: '#5E6C84', label: servicio.estado };
    const accentColor = ACCENT_COLOR[servicio.estado] ?? COLORS.border;
    const avance = AVANCE_CONFIG[servicio.estado] ?? null;

    const handleAvanzar = async () => {
        if (!avance || loading) return;
        setLoading(true);
        try {
            if (servicio.fuente === 'PROGRAMACION') {
                await driverApi.avanzarProgramacion(servicio.id, avance.accion);
            } else {
                await driverApi.updateServiceStatus(servicio.id, avance.accion);
            }
            onActualizado();
        } catch {
            Alert.alert('Error', 'No se pudo actualizar el estado. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[s.card, { borderLeftColor: accentColor }]}>
            {/* Header */}
            <View style={s.header}>
                <View style={s.headerLeft}>
                    <Text style={s.codigo}>{servicio.codigo}</Text>
                    <Text style={s.fuente}>
                        {servicio.fuente === 'PROGRAMACION' ? '🏷️ PROG' : '📋 SERV'}
                    </Text>
                </View>
                <View style={[s.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[s.badgeTx, { color: badge.text }]}>{badge.label}</Text>
                </View>
            </View>

            {/* Doctor / Patient */}
            {servicio.fuente === 'PROGRAMACION' && servicio.doctor_nombre ? (
                <Text style={s.nombre} numberOfLines={1}>Dr. {servicio.doctor_nombre}</Text>
            ) : (
                <Text style={s.nombre} numberOfLines={1}>{servicio.paciente.nombre}</Text>
            )}

            {/* Clinica */}
            {servicio.clinica.nombre ? (
                <Text style={s.subtexto} numberOfLines={1}>🏥 {servicio.clinica.nombre}</Text>
            ) : null}

            {/* Horario */}
            {servicio.fuente === 'PROGRAMACION' && servicio.turno ? (
                <Text style={s.horario}>
                    {'Turno ' + servicio.turno}
                    {servicio.hora_inicio && servicio.hora_fin
                        ? '  ·  ' + servicio.hora_inicio + ' — ' + servicio.hora_fin
                        : ''}
                    {servicio.fecha ? '  ·  ' + servicio.fecha : ''}
                </Text>
            ) : null}

            {/* Origin */}
            {servicio.origen.direccion ? (
                <View style={s.rutaRow}>
                    <Text style={s.rutaIcon}>📍</Text>
                    <Text style={s.rutaTx} numberOfLines={1}>{servicio.origen.direccion}</Text>
                </View>
            ) : null}

            {/* Stepper */}
            <Stepper estado={servicio.estado} />

            {/* Action button */}
            {avance ? (
                <TouchableOpacity
                    style={[s.btn, { backgroundColor: avance.bg }, loading && s.btnDisabled]}
                    onPress={handleAvanzar}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    {loading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.btnTx}>{avance.label}</Text>
                    }
                </TouchableOpacity>
            ) : (
                <View style={s.completadoBadge}>
                    <Text style={s.completadoTx}>✅ Servicio completado</Text>
                </View>
            )}
        </View>
    );
}

// ── Stepper styles ────────────────────────────────────────────────────────────
const st = StyleSheet.create({
    stepper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 10,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.border,
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    dotDone: {
        backgroundColor: COLORS.accent,
        borderColor: COLORS.accent,
    },
    dotCurrent: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#ffffff',
        borderColor: COLORS.accent,
        borderWidth: 3,
    },
    line: {
        flex: 1,
        height: 2,
        backgroundColor: COLORS.border,
        marginHorizontal: 2,
    },
    lineDone: {
        backgroundColor: COLORS.accent,
    },
});

// ── Card styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    card: {
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.lg,
        borderLeftWidth: 4,
        marginHorizontal: 16,
        marginVertical: 6,
        padding: 16,
        ...SHADOW.card,
        gap: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    codigo: {
        fontSize: 12,
        fontWeight: '700',
        color: COLORS.textSecondary,
        letterSpacing: 0.5,
    },
    fuente: {
        fontSize: 11,
        color: COLORS.textMuted,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: RADIUS.pill,
    },
    badgeTx: {
        fontSize: 11,
        fontWeight: '700',
    },
    nombre: {
        fontSize: 17,
        fontWeight: '800',
        color: COLORS.textPrimary,
        lineHeight: 22,
    },
    subtexto: {
        fontSize: 13,
        color: COLORS.textSecondary,
    },
    horario: {
        fontSize: 13,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    rutaRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 2,
    },
    rutaIcon: {
        fontSize: 13,
        marginTop: 1,
    },
    rutaTx: {
        flex: 1,
        fontSize: 13,
        color: COLORS.textSecondary,
        lineHeight: 18,
    },
    btn: {
        marginTop: 4,
        paddingVertical: 14,
        borderRadius: RADIUS.md,
        alignItems: 'center',
    },
    btnDisabled: {
        backgroundColor: '#9CA3AF',
    },
    btnTx: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    completadoBadge: {
        marginTop: 4,
        paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: '#E3FCEF',
        borderRadius: RADIUS.md,
    },
    completadoTx: {
        fontSize: 14,
        fontWeight: '700',
        color: '#006644',
    },
});
