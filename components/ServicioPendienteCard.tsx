import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
    ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { driverApi } from '@/services/api';
import type { Servicio } from '@/types/servicios';
import { C } from '@/types/servicios';

interface Props {
    servicio: Servicio;
    onAceptado: () => void;
}

export function ServicioPendienteCard({ servicio, onAceptado }: Props) {
    const [loading, setLoading] = useState(false);

    const handleAceptar = async () => {
        if (loading) return;
        setLoading(true);
        try {
            if (servicio.fuente === 'PROGRAMACION') {
                await driverApi.responderProgramacion(servicio.id, 'ACEPTAR');
            } else {
                await driverApi.acceptService(servicio.id);
            }
            onAceptado();
        } catch {
            Alert.alert('Error', 'No se pudo aceptar el servicio. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={s.card}>
            {/* Header */}
            <View style={s.header}>
                <Text style={s.codigo}>{servicio.codigo}</Text>
                <View style={s.badge}>
                    <Text style={s.badgeTx}>Pendiente</Text>
                </View>
            </View>

            {/* Doctor / Patient */}
            {servicio.fuente === 'PROGRAMACION' && servicio.doctor_nombre ? (
                <Text style={s.nombre} numberOfLines={1}>Dr. {servicio.doctor_nombre}</Text>
            ) : (
                <Text style={s.nombre} numberOfLines={1}>{servicio.paciente.nombre}</Text>
            )}
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

            {/* Route */}
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

            {/* Meta */}
            {servicio.tiempoEstimado != null || servicio.distanciaEstimada != null ? (
                <View style={s.metaRow}>
                    {servicio.tiempoEstimado != null && (
                        <Text style={s.metaTx}>⏱ {servicio.tiempoEstimado} min</Text>
                    )}
                    {servicio.distanciaEstimada != null && (
                        <Text style={s.metaTx}>📏 {servicio.distanciaEstimada} km</Text>
                    )}
                </View>
            ) : null}

            {/* Accept button */}
            <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={handleAceptar}
                disabled={loading}
                activeOpacity={0.85}
            >
                {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.btnTx}>✅  Aceptar servicio</Text>
                }
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: C.card,
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#F59E0B',
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
    codigo: {
        fontSize: 12,
        fontWeight: '700',
        color: C.grisTexto,
        letterSpacing: 0.5,
    },
    badge: {
        backgroundColor: C.badgePending,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 20,
    },
    badgeTx: {
        fontSize: 11,
        fontWeight: '700',
        color: C.badgePendTx,
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
    metaRow: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 2,
    },
    metaTx: {
        fontSize: 12,
        color: C.grisTexto,
    },
    btn: {
        marginTop: 10,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: C.verde,
        shadowColor: C.verde,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    btnDisabled: {
        backgroundColor: '#9CA3AF',
        shadowOpacity: 0,
        elevation: 0,
    },
    btnTx: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
});
