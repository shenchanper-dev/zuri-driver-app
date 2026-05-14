import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
    setupNotificationChannel,
    registerForPushNotifications,
    setupNotificationListeners,
} from '@/services/notifications';

export function usePushNotifications(conductorId: number | undefined) {
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (!conductorId) return;

        let cleanup: (() => void) | undefined;

        (async () => {
            await setupNotificationChannel();
            await registerForPushNotifications();
            cleanup = setupNotificationListeners();
        })();

        return () => {
            cleanup?.();
        };
    }, [conductorId]);
}
