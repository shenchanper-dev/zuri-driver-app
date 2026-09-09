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
    private currentConductorId: number | null = null;
    private pendingListeners: Array<{ event: string; callback: (data: any) => void }> = [];
    private connectionChangeCallbacks: Array<(connected: boolean) => void> = [];
    private connectPromise: Promise<boolean> | null = null; // 🔧 evita conexiones concurrentes

    /**
     * Connect to WebSocket server
     */
    async connect(): Promise<boolean> {
        // 🔧 FIX: si ya hay una conexion en progreso, reutilizar su promise
        // (evita que llamados duplicados de connect() rompan el handshake en curso)
        if (this.connectPromise) {
            console.log('🔌 [SocketService] connect() ya en progreso, reutilizando promise');
            return this.connectPromise;
        }
        this.connectPromise = this._doConnect().finally(() => {
            this.connectPromise = null;
        });
        return this.connectPromise;
    }

    private async _doConnect(): Promise<boolean> {
        try {
            const token = await secureStorage.getItem(TOKEN_KEY);

            if (!token) {
                console.warn('❌ [SocketService] No auth token for socket connection');
                return false;
            }

            const isProd = !__DEV__;
            const finalUrl = isProd ? 'https://app.zuri.pe' : SOCKET_URL;

            // 🔧 FIX cascada: garantizar UN SOLO socket vivo.
            // connect() se llama desde 5 lugares (mount, focus, AppState, boton, etc).
            // El guardia anterior solo miraba .connected, pero durante el handshake
            // (~200-800ms) .connected es false y this.socket ya existe, permitiendo
            // que se creen multiples io() en cascada (bug de N sockets simultaneos,
            // confirmado en conductores 25 y 196: 5 sockets muriendo en el mismo segundo).
            if (this.socket) {
                const sameToken = (this.socket as any)?.auth?.token === token;
                if (this.socket.connected && sameToken) {
                    console.log('🔌 [SocketService] Ya conectado (mismo token), reutilizando');
                    return true;
                }
                console.log('🔌 [SocketService] Limpiando socket previo antes de reconectar (estado:', this.socket.connected ? 'conectado' : 'handshake/desconectado', ')');
                this.socket.removeAllListeners();
                this.socket.disconnect();
                this.socket = null;
            }

            console.log('🔌 [SocketService] Connecting to:', finalUrl);

            this.socket = io(finalUrl, {
                auth: { token },
                transports: ['polling', 'websocket'], // ZURI-FIX 2026-03-30: polling primero para handshake inicial correcto con Nginx/Socket.IO
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000,
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

                    // Replay any listeners that were buffered before connect
                    if (this.pendingListeners.length > 0) {
                        console.log(`🔌 [SocketService] Replaying ${this.pendingListeners.length} buffered listener(s)`);
                        for (const { event, callback } of this.pendingListeners) {
                            this.socket!.on(event, callback);
                        }
                        this.pendingListeners = [];
                    }

                    // Notify connection change callbacks
                    this.connectionChangeCallbacks.forEach(cb => cb(true));

                    resolve(true);
                });

                this.socket.on('connect_error', (error) => {
                    const errDesc = (error as Error & { description?: string }).description ?? '';
                    console.error('❌ [SocketService] Connection error:', error.message, errDesc);
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
     * Store the current conductor ID so it can be re-registered after reconnection
     */
    setDriverId(conductorId: number) {
        this.currentConductorId = conductorId;
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners() {
        if (!this.socket) return;

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Socket disconnected:', reason);
            // Notify connection change callbacks
            this.connectionChangeCallbacks.forEach(cb => cb(false));
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔌 Socket reconnected after', attemptNumber, 'attempts');
            // Re-register driver after reconnection so the server tracks the new socket ID
            if (this.currentConductorId) {
                this.socket?.emit('driver:register', { conductorId: this.currentConductorId });
                console.log('🔌 Re-registered driver:', this.currentConductorId);
            }
            // Notify connection change callbacks
            this.connectionChangeCallbacks.forEach(cb => cb(true));
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        // NOTE: service:assigned is NOT handled here.
        // Components register their own listeners via socket.on() which
        // are buffered in pendingListeners until the socket connects.

        // Location acknowledgment
        this.socket.on('driver:location:ack', (_data) => {
            // console.log('📍 Location update acknowledged:', _data.timestamp);
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
     * Listen to event (buffers if socket not yet connected)
     */
    on(event: string, callback: (data: any) => void) {
        if (this.socket) {
            this.socket.on(event, callback);
        } else {
            // Buffer the listener — it will be replayed once connect() succeeds
            console.log(`🔌 [SocketService] Buffering listener for "${event}" (socket not connected yet)`);
            this.pendingListeners.push({ event, callback });
        }
    }

    /**
     * Remove event listener (also cleans from pending buffer)
     */
    off(event: string, callback?: (data: any) => void) {
        if (this.socket) {
            this.socket.off(event, callback);
        }
        // Also remove from pending buffer
        if (callback) {
            this.pendingListeners = this.pendingListeners.filter(
                p => !(p.event === event && p.callback === callback)
            );
        } else {
            this.pendingListeners = this.pendingListeners.filter(p => p.event !== event);
        }
    }

    /**
     * Register a callback for connection state changes
     */
    onConnectionChange(callback: (connected: boolean) => void): () => void {
        this.connectionChangeCallbacks.push(callback);
        return () => {
            this.connectionChangeCallbacks = this.connectionChangeCallbacks.filter(cb => cb !== callback);
        };
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
