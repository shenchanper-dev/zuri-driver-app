/**
 * ZURI Driver App - WebSocket Service
 * Real-time communication with the dashboard
 */

import { io, Socket } from 'socket.io-client';
import { secureStorage, TOKEN_KEY } from './storage';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'wss://admin.zuri.pe';

// ============================================================================
// Socket Instance
// ============================================================================

class SocketService {
    private socket: Socket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;

    /**
     * Connect to WebSocket server
     */
    async connect(): Promise<boolean> {
        try {
            const token = await secureStorage.getItem(TOKEN_KEY);

            if (!token) {
                console.warn('❌ [SocketService] No auth token for socket connection');
                return false;
            }

            const isProd = !__DEV__;
            const finalUrl = isProd ? 'https://app.zuri.pe' : SOCKET_URL;

            console.log('🔌 [SocketService] Connecting to:', finalUrl);

            // Disconnect existing connection
            if (this.socket?.connected) {
                console.log('🔌 [SocketService] Disconnecting previous socket');
                this.socket.disconnect();
            }

            this.socket = io(finalUrl, {
                auth: { token },
                transports: ['polling', 'websocket'], // ZURI-FIX 2026-03-30: polling primero para handshake inicial correcto con Nginx/Socket.IO
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                path: '/socket.io/', // Con barra diagonal para coincidir con Nginx
            });

            // Event listeners
            this.setupEventListeners();

            return new Promise((resolve) => {
                if (!this.socket) {
                    console.error('❌ [SocketService] Socket instance not created');
                    resolve(false);
                    return;
                }

                const timeoutId = setTimeout(() => {
                    if (!this.socket?.connected) {
                        console.warn('🕒 [SocketService] Connection timeout (15s)');
                        resolve(false);
                    }
                }, 15000);

                this.socket.on('connect', () => {
                    console.log('✅ [SocketService] Connected successfully (ID:', this.socket?.id, ')');
                    this.reconnectAttempts = 0;
                    clearTimeout(timeoutId);
                    resolve(true);
                });

                this.socket.on('connect_error', (error) => {
                    console.error('❌ [SocketService] Connection error:', error.message, error.description || '');
                    this.reconnectAttempts++;

                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        clearTimeout(timeoutId);
                        resolve(false);
                    }
                });
            });

        } catch (error: any) {
            console.error('❌ [SocketService] Unexpected error during connection:', error.message);
            return false;
        }
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners() {
        if (!this.socket) return;

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Socket disconnected:', reason);
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔌 Socket reconnected after', attemptNumber, 'attempts');
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        // Service assignment notification
        this.socket.on('service:assigned', (data) => {
            console.log('📋 New service assigned:', data);
            // This will trigger a notification/alert in the app
        });

        // Location acknowledgment
        this.socket.on('driver:location:ack', (data) => {
            // console.log('📍 Location update acknowledged:', data.timestamp);
        });

        // Status acknowledgment
        this.socket.on('driver:status:ack', (data) => {
            console.log('✅ Status updated:', data.status);
        });
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    /**
     * Emit event
     */
    emit(event: string, data: any) {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        } else {
            console.warn('Socket not connected, cannot emit:', event);
        }
    }

    /**
     * Listen to event
     */
    on(event: string, callback: (data: any) => void) {
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }

    /**
     * Remove event listener
     */
    off(event: string, callback?: (data: any) => void) {
        if (this.socket) {
            this.socket.off(event, callback);
        }
    }

    /**
     * Check if connected
     */
    get isConnected(): boolean {
        return this.socket?.connected || false;
    }
}

// ============================================================================
// Export singleton
// ============================================================================

export const socket = new SocketService();

// Also export raw emit/on for convenience
export const socketEmit = (event: string, data: any) => socket.emit(event, data);
export const socketOn = (event: string, cb: (data: any) => void) => socket.on(event, cb);
export const socketOff = (event: string, cb?: (data: any) => void) => socket.off(event, cb);
