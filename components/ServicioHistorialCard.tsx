import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Servicio } from '@/types/servicios';
import { C, BADGE_CONFIG, ACCENT_COLOR } from '@/types/servicios';

interface Props {
    servicio: Servicio;
}

export function ServicioHistorialCard({ servicio }: Props) {
    const badge = BADGE_CONFIG[servicio.estado] ?? { bg: '#F3F4F6', text: '#374151', label: servicio.estado };
    const accentColor = ACCENT_COLOR[servicio.estado] ?? C.borde;

    const fecha = servicio.fechaHora
        ? new Date(servicio.fechaHora).toLocaleDateString('es-PE', {
              day: '2-digit', month: 'short', year: 'numeric',
          })
        : null;

    return (
        <View style={[s.card, { borderLeftColor: accentColor }]}>
            {/* Header */}
            <View style={s.header}>
                <View style={s.headerLeft}>
                    <Text style={s.codigo}>{servicio.codigo}</Text>
                    {fecha ? <Text style={s.fecha}>{fecha}</Text> : null}
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

            <Text style={s.subtexto} numberOfLines={1}>{servicio.clinica.nombre}</Text>

            {/* Route (compact) */}
            <View style={s.rutaRow}>
                <Text style={s.rutaIcon}>📍</Text>
                <Text style={s.rutaTx} numberOfLines={1}>{servicio.origen.direccion}</Text>
            </View>
            <View style={s.rutaRow}>
                <Text style={s.rutaIcon}>🏥</Text>
                <Text style={s.rutaTx} numberOfLines={1}>{servicio.destino.direccion}</Text>
            </View>
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
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
        gap: 5,
        opacity: 0.85,
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
    fecha: {
        fontSize: 11,
        color: C.muteText,
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
        fontSize: 15,
        fontWeight: '700',
        color: C.azulTexto,
        lineHeight: 20,
    },
    subtexto: {
        fontSize: 12,
        color: C.grisTexto,
    },
    rutaRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 2,
    },
    rutaIcon: {
        fontSize: 12,
        marginTop: 1,
    },
    rutaTx: {
        flex: 1,
        fontSize: 12,
        color: C.muteText,
        lineHeight: 17,
    },
});
