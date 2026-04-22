import { useEffect, useRef } from 'react';
import { Vibration, Platform } from 'react-native';
import { socket } from '@/services/socket';
import type { AsignacionProgramacion, Servicio } from '@/types/servicios';

interface Callbacks {
    onProgramacionAsignada: (asignacion: AsignacionProgramacion) => void;
    onServicioAsignado: (servicio: Partial<Servicio>) => void;
    onServicioActualizado: () => void;
}

/**
 * Subscribes to socket events for service assignments and updates.
 * Automatically cleans up listeners on unmount.
 */
export function useServicioSocket(callbacks: Callbacks) {
    // Use refs so the socket event handlers never go stale
    const cbRef = useRef(callbacks);
    useEffect(() => { cbRef.current = callbacks; });

    // Track IDs of assignments already shown to prevent duplicates
    // (socket + FCM push can race and both emit for same assignment)
    const shownIdsRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        const handleAssigned = (data: any) => {
            if (Platform.OS !== 'web') {
                Vibration.vibrate([0, 500, 200, 500, 200, 500]);
            }

            if (data?.tipo === 'programacion_detalle') {
                // Deduplication: skip if already shown
                if (shownIdsRef.current.has(data.id)) {
                    console.log(`[useServicioSocket] Skipping duplicate assignment ${data.id}`);
                    return;
                }
                shownIdsRef.current.add(data.id);
                cbRef.current.onProgramacionAsignada(data as AsignacionProgramacion);
            } else {
                cbRef.current.onServicioAsignado(data);
            }
        };

        const handleUpdated = () => {
            cbRef.current.onServicioActualizado();
        };

        socket.on('service:assigned', handleAssigned);
        socket.on('service:updated', handleUpdated);

        return () => {
            socket.off('service:assigned', handleAssigned);
            socket.off('service:updated', handleUpdated);
        };
    }, []); // stable — no external deps
}
