import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
    setupNotificationChannel,
    registerForPushNotifications,
// setupNotificationListeners moved to _layout.tsx (avoid double registration)
} from '@/services/notifications';

export function usePushNotifications(conductorId: number | undefined) {
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (!conductorId) return;

        let cleanup: (() => void) | undefined;

        (async () => {
            await setupNotificationChannel();
            await registerForPushNotifications();
            // Listeners registered in app/_layout.tsx to avoid double registration
        })();

        return () => {
            cleanup?.();
        };
    }, [conductorId]);
}
