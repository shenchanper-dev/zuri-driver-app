import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
    setupNotificationChannel,
    registerForFcmPushNotifications,
} from '@/services/notifications';

export function usePushNotifications(conductorId: number | undefined) {
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (!conductorId) return;

        (async () => {
            await setupNotificationChannel();
            await registerForFcmPushNotifications();
        })();
    }, [conductorId]);
}
