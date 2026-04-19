import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
    ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { driverApi } from '@/services/api';
import type { Servicio, AccionProgresion } from '@/types/servicios';
import { C, BADGE_CONFIG, ACCENT_COLOR, AVANCE_CONFIG } from '@/types/servicios';

interface Props {
    servicio: Servicio;
    onActualizado: () => void;
}

export function ServicioActivoCard({ servicio, onActualizado }: Props) {
    const [loading, setLoading] = useState(false);

    const badge = BADGE_CONFIG[servicio.estado] ?? { bg: '#F3F4F6', text: '#374151', label: servicio.estado };
    const accentColor = ACCENT_COLOR[servicio.estado] ?? C.borde;
    const avance = AVANCE_CONFIG[servicio.estado];

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
            {/* Header row */}
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

            {/* Turno / Horario (programacion) */}
            {servicio.fuente === 'PROGRAMACION' && servicio.turno ? (
                <Text style={s.horario}>
                    {'Turno ' + servicio.turno}
                    {servicio.hora_inicio && servicio.hora_fin
                        ? '  ·  ' + servicio.hora_inicio + ' — ' + servicio.hora_fin
                        : ''}
                    {servicio.fecha ? '  ·  ' + servicio.fecha : ''}
                </Text>
            ) : null}

            {/* Origin / District */}
            {servicio.origen.direccion ? (
                <View style={s.rutaRow}>
                    <Text style={s.rutaIcon}>📍</Text>
                    <Text style={s.rutaTx} numberOfLines={1}>{servicio.origen.direccion}</Text>
                </View>
            ) : null}
            {servicio.origen.referencia ? (
                <View style={s.rutaRow}>
                    <Text style={s.rutaIcon}>📌</Text>
                    <Text style={s.rutaTx} numberOfLines={1}>{servicio.origen.referencia}</Text>
                </View>
            ) : null}

            {/* Action button — hidden when COMPLETADO */}
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

const s = StyleSheet.create({
    card: {
        backgroundColor: C.card,
        borderRadius: 16,
        borderLeftWidth: 4,
        marginHorizontal: 16,
        marginVertical: 6,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
        gap: 6,
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
        color: C.grisTexto,
        letterSpacing: 0.5,
    },
    fuente: {
        fontSize: 11,
        color: C.grisTexto,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 20,
    },
    badgeTx: {
        fontSize: 11,
        fontWeight: '700',
    },
    nombre: {
        fontSize: 17,
        fontWeight: '800',
        color: C.azulTexto,
        lineHeight: 22,
    },
    subtexto: {
        fontSize: 13,
        color: C.grisTexto,
    },
    horario: {
        fontSize: 13,
        color: C.grisTexto,
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
        color: C.grisTexto,
        lineHeight: 18,
    },
    btn: {
        marginTop: 10,
        paddingVertical: 14,
        borderRadius: 12,
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
        marginTop: 10,
        paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: '#D1FAE5',
        borderRadius: 12,
    },
    completadoTx: {
        fontSize: 14,
        fontWeight: '700',
        color: '#065F46',
    },
});
