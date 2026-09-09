import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Vibration, Modal, Platform,
} from 'react-native';

interface NuevoServicioPopupProps {
  visible: boolean;
  data: {
    title?: string;
    body?: string;
    fecha?: string;
    hora?: string;
    horaFin?: string;
    turno?: string;
    distrito?: string;
    cliente?: string;
    serviceId?: string;
  } | null;
  onVerServicio: () => void;
  onClose: () => void;
}

export function NuevoServicioPopup({ visible, data, onVerServicio, onClose }: NuevoServicioPopupProps) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 250, 250, 250]);
      }
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible || !data) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Animated.View style={[s.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={s.pulseBar} />

          <View style={s.header}>
            <Text style={s.bellIcon}>🔔</Text>
            <Text style={s.title}>SERVICIO ASIGNADO</Text>
          </View>

          <View style={s.body}>
            {data.body ? (
              <Text style={s.bodyText}>{data.body}</Text>
            ) : null}

            {(data.fecha || data.hora || data.turno) && (
              <View style={s.row}>
                <Text style={s.rowIcon}>📅</Text>
                <Text style={s.rowText}>
                  {[
                    data.turno ? `Turno ${data.turno}` : null,
                    data.fecha,
                    data.hora ? (data.horaFin ? `${data.hora}-${data.horaFin}` : data.hora) : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}

            {data.distrito && (
              <View style={s.row}>
                <Text style={s.rowIcon}>📍</Text>
                <Text style={s.rowText}>{data.distrito}</Text>
              </View>
            )}

            {data.cliente && (
              <View style={s.row}>
                <Text style={s.rowIcon}>🏥</Text>
                <Text style={s.rowText}>{data.cliente}</Text>
              </View>
            )}
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.btnSecondary} onPress={onClose} activeOpacity={0.8}>
              <Text style={s.btnSecondaryTx}>Cerrar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPrimary} onPress={onVerServicio} activeOpacity={0.8}>
              <Text style={s.btnPrimaryTx}>Ver servicio</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  pulseBar: {
    height: 4,
    backgroundColor: '#0EA5E9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 24,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  bellIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0B1F3A',
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
  },
  bodyText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rowIcon: {
    fontSize: 16,
  },
  rowText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  btnSecondaryTx: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#0EA5E9',
  },
  btnPrimaryTx: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
