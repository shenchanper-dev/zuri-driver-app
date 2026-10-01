/**
 * ZURI Driver — wrapper Traccar Client SDK 1.0.11 (reemplaza nativeTracking.ts).
 * El SDK sube por protocolo OsmAnd a serverUrl con id=device_token (sin Bearer).
 * device_token (!= JWT) lo emite POST /api/v3/device-tokens y se guarda aparte.
 */
import * as Traccar from 'react-native-traccar-client-sdk';
import type { Config } from 'react-native-traccar-client-sdk';
import Constants from 'expo-constants';
import { api } from '@/services/api';
import { secureStorage, TOKEN_KEY } from '@/services/storage';

const DEVICE_TOKEN_KEY = 'zuri_device_token';            // != TOKEN_KEY (JWT)
const SERVER_URL = 'https://admin.zuri.pe/api/v3/osmand';

export type IssueResult = { ok: true } | { ok: false; reason: 'auth' | 'network' };

// Apendice A literal (enteros; accuracy MAYUSCULA; stopDetection/wakeLock true)
function buildTraccarConfig(deviceId: string): Config {
  return {
    serverUrl: SERVER_URL,
    deviceId,
    wakeLock: true,
    buffer: true,
    preferPlatformProviders: false,
    location: {
      accuracy: 'HIGH',
      distanceMeters: 100,
      intervalSeconds: 60,
      angleDegrees: 30,
      stopDetection: true,
      stopTimeoutSeconds: 60,
      stationaryRadiusMeters: 100,
      heartbeatIntervalSeconds: 60,
    },
    notification: { text: 'ZURI Conductor · En servicio' },
  };
}

export async function getDeviceToken(): Promise<string | null> {
  return secureStorage.getItem(DEVICE_TOKEN_KEY);
}

// Edge-case re-login mismo proceso: setConfig reconfigura el tracker vivo con el
// deviceId nuevo (destraba la cola); init como fallback si no hay tracker.
async function applyConfig(cfg: Config): Promise<void> {
  try { await Traccar.setConfig(cfg); }
  catch { await Traccar.init(cfg); }
}

// Single-flight: si ya hay una emision en curso, devuelve la MISMA promesa
// (evita doble arranque login vs recovery de _layout).
let _issueInFlight: Promise<IssueResult> | null = null;

export function issueTokenAndStart(): Promise<IssueResult> {
  if (_issueInFlight) return _issueInFlight;
  _issueInFlight = (async (): Promise<IssueResult> => {
    const appVersion = Constants.expoConfig?.version;
    const res = await api.authPost('/v3/device-tokens', appVersion ? { appVersion } : {});
    if (res.success && res.token) {
      await secureStorage.setItem(DEVICE_TOKEN_KEY, res.token);
      await applyConfig(buildTraccarConfig(res.token));
      await Traccar.start();
      return { ok: true };
    }
    // httpStatus lo expone api.ts solo en errores. 401 = JWT vencido/ausente -> login.
    const reason: 'auth' | 'network' = res.httpStatus === 401 ? 'auth' : 'network';
    console.warn('[traccar] issueTokenAndStart fallo:', res.httpStatus, res.error);
    return { ok: false, reason };
  })().finally(() => { _issueInFlight = null; });
  return _issueInFlight;
}

/** Caida / cold-start CON device_token: init+start, sin servidor ni JWT (dia 8). */
export async function resumeTracking(): Promise<boolean> {
  const token = await secureStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) return false;
  await applyConfig(buildTraccarConfig(token));
  await Traccar.start();
  return true;
}

/** Logout: stop + revoca (best-effort) + borra device_token. */
export async function stopAndRevoke(): Promise<void> {
  try { await Traccar.stop(); } catch (e) { console.warn('[traccar] stop:', e); }
  try { await api.authPost('/v3/device-tokens/revoke', {}); }
  catch (e) { console.warn('[traccar] revoke:', e); }
  await secureStorage.deleteItem(DEVICE_TOKEN_KEY);
}

/** Estado REAL del ForegroundService (StateFlow via bridge). */
export async function isActive(): Promise<boolean> {
  try { return await Traccar.isTracking(); } catch { return false; }
}

/** Boton "Reconectar" — Apendice B (401 -> login; red/otro -> failed). */
export async function restart(): Promise<'started' | 'needs-login' | 'failed'> {
  try {
    if (await getDeviceToken()) return (await resumeTracking()) ? 'started' : 'failed';
    const jwt = await secureStorage.getItem(TOKEN_KEY);
    if (!jwt) return 'needs-login';
    const r = await issueTokenAndStart();
    if (r.ok) return 'started';
    return r.reason === 'auth' ? 'needs-login' : 'failed';
  } catch (e) {
    console.warn('[traccar] restart fallo:', e);
    return 'failed';
  }
}
