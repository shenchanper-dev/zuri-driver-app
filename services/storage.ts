/**
 * ZURI Driver App - Almacenamiento Seguro Multiplataforma
 * SecureStore no funciona en web, así que usamos localStorage como alternativa
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const TOKEN_KEY = 'zuri_auth_token';

/**
 * Utilidad de almacenamiento seguro multiplataforma
 * Usa SecureStore en iOS/Android y localStorage en web
 */
export const secureStorage = {
    async getItem(key: string): Promise<string | null> {
        if (Platform.OS === 'web') {
            return localStorage.getItem(key);
        }
        return SecureStore.getItemAsync(key);
    },

    async setItem(key: string, value: string): Promise<void> {
        if (Platform.OS === 'web') {
            localStorage.setItem(key, value);
            return;
        }
        await SecureStore.setItemAsync(key, value);
    },

    async deleteItem(key: string): Promise<void> {
        if (Platform.OS === 'web') {
            localStorage.removeItem(key);
            return;
        }
        await SecureStore.deleteItemAsync(key);
    }
};
