import type { IClientOptions } from 'mqtt';
import { describeError } from './errorFormat.js';
import type { MqttPreparedConnection } from './mqttCertificate.js';

export const MQTT_OFFLINE_RECONNECT_DELAY_MS = 60000;
export const MQTT_PORT = 8883;
export const MQTT_KEEPALIVE_SECONDS = 300;

/**
 * Options for `mqtt.connect` to LG's MQTT server (AWS IoT).
 *
 * These are the settings the plugin used through aws-iot-device-sdk, which wrapped
 * the same mqtt library: MQTT 3.1.1 over TLS on port 8883, signed in with the client
 * certificate from LG, and a keepalive of 5 minutes. The server certificate is
 * checked against the root certificate (mqtt sets the server name for TLS).
 * reconnectPeriod must stay above 0: mqtt only emits `offline` when it would
 * reconnect, and `wireMqttDeviceEvents` reconnects on `offline`.
 */
export function mqttClientOptions(connectData: MqttPreparedConnection['connectData']): IClientOptions {
  return {
    protocol: 'mqtts',
    host: connectData.host,
    port: MQTT_PORT,
    protocolVersion: 4,
    clientId: connectData.clientId,
    ca: connectData.ca,
    key: connectData.key,
    cert: connectData.cert,
    rejectUnauthorized: true,
    keepalive: MQTT_KEEPALIVE_SECONDS,
    reconnectPeriod: 1000,
    clean: true,
  };
}

export type MqttRuntimeDevice = {
  on(event: 'error', handler: (err: unknown) => void): unknown;
  on(event: 'connect', handler: () => void): unknown;
  on(event: 'message', handler: (topic: string, payload: Buffer) => void): unknown;
  on(event: 'offline', handler: () => void): unknown;
  subscribe(subscription: string): unknown;
  end(): unknown;
};

export type MqttRuntimeLogger = {
  debug(...args: any[]): void;
  error(...args: any[]): void;
  info(...args: any[]): void;
};

export type MqttReconnectScheduler = (
  handler: () => void | Promise<void>,
  delayMs: number,
) => unknown;

export function wireMqttDeviceEvents(options: {
  device: MqttRuntimeDevice;
  logger: MqttRuntimeLogger;
  mqttServer: string;
  subscriptions: string[];
  onMessage: (data: any) => void;
  reconnect: () => Promise<void>;
  scheduleReconnect?: MqttReconnectScheduler;
}): void {
  const {
    device,
    logger,
    mqttServer,
    subscriptions,
    onMessage,
    reconnect,
    scheduleReconnect = (handler, delayMs) => setTimeout(() => {
      void handler();
    }, delayMs),
  } = options;

  device.on('error', (err) => {
    logger.error('mqtt err:', describeError(err));
  });

  device.on('connect', () => {
    logger.info('Successfully connected to the MQTT server.');
    logger.debug('mqtt connected:', mqttServer);
    for (const subscription of subscriptions) {
      device.subscribe(subscription);
    }
  });

  device.on('message', (_topic, payload) => {
    const payloadText = payload.toString();
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err) {
      logger.error('mqtt message parse error:', describeError(err));
      logger.debug('mqtt invalid message received:', payloadText);
      return;
    }

    onMessage(parsedPayload);
    logger.debug('mqtt message received:', payloadText);
  });

  device.on('offline', () => {
    // mqtt emits `offline` just before it starts its own reconnect timer, so ending
    // the client during the event leaves that timer running: the closed client would
    // keep reconnecting every second with the same client id, next to the new one.
    // Ending it right after the event also stops the timer.
    queueMicrotask(() => device.end());

    logger.info('MQTT disconnected, retrying in 60 seconds!');
    scheduleReconnect(() => {
      reconnect().catch(err => {
        logger.error('mqtt reconnect failed:', describeError(err));
      });
    }, MQTT_OFFLINE_RECONNECT_DELAY_MS);
  });
}
