import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import tls from 'node:tls';
import forge from 'node-forge';
import mqtt, { type MqttClient } from 'mqtt';
import mqttPacket from 'mqtt-packet';
import {
  MQTT_KEEPALIVE_SECONDS,
  MQTT_OFFLINE_RECONNECT_DELAY_MS,
  MQTT_PORT,
  mqttClientOptions,
  wireMqttDeviceEvents,
} from './mqttConnection.js';

// Checks the connection to LG's MQTT server with a local MQTT server over TLS, using
// certificates made up for the test: a CA, a server certificate for "localhost"
// signed by it, and a client certificate, as LG issues one for each client.

type Identity = { keyPem: string, certPem: string, key: forge.pki.PrivateKey, cert: forge.pki.Certificate };

function createIdentity(commonName: string, issuer?: Identity, options: { ca?: boolean, dnsName?: string } = {}): Identity {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const key = forge.pki.privateKeyFromPem(keyPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString());
  cert.serialNumber = String(Date.now() % 1000000) + Math.floor(Math.random() * 1000);
  cert.validity.notBefore = new Date(Date.now() - 60000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  cert.setSubject([{ name: 'commonName', value: commonName }]);
  cert.setIssuer((issuer?.cert ?? cert).subject.attributes);
  const extensions: object[] = [{ name: 'basicConstraints', cA: options.ca === true }];
  if (options.ca) {
    extensions.push({ name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true });
  }
  if (options.dnsName) {
    extensions.push({ name: 'subjectAltName', altNames: [{ type: 2, value: options.dnsName }] });
  }
  cert.setExtensions(extensions);
  cert.sign((issuer?.key ?? key) as forge.pki.rsa.PrivateKey, forge.md.sha256.create());
  return { keyPem, certPem: forge.pki.certificateToPem(cert), key, cert };
}

const rootCa = createIdentity('Test Root CA', undefined, { ca: true });
const serverIdentity = createIdentity('localhost', rootCa, { dnsName: 'localhost' });
const clientIdentity = createIdentity('Test MQTT client', rootCa);
const otherCa = createIdentity('Other Root CA', undefined, { ca: true });

type ReceivedPacket = mqttPacket.Packet & { clientId?: string, keepalive?: number, protocolVersion?: number,
  subscriptions?: { topic: string }[] };

/** A minimal MQTT server: answers CONNECT and SUBSCRIBE, and records every packet. */
async function startMqttServer() {
  const packets: ReceivedPacket[] = [];
  const sockets: tls.TLSSocket[] = [];
  const clientCertificates: (string | undefined)[] = [];
  const server = tls.createServer({
    key: serverIdentity.keyPem,
    cert: serverIdentity.certPem,
    ca: rootCa.certPem,
    requestCert: true,
    rejectUnauthorized: true,
  }, socket => {
    sockets.push(socket);
    clientCertificates.push(socket.getPeerCertificate()?.subject?.CN as string | undefined);
    const parser = mqttPacket.parser();
    parser.on('packet', (packet: ReceivedPacket) => {
      packets.push(packet);
      if (packet.cmd === 'connect') {
        socket.write(mqttPacket.generate({ cmd: 'connack', returnCode: 0, sessionPresent: false }));
      } else if (packet.cmd === 'subscribe') {
        socket.write(mqttPacket.generate({
          cmd: 'suback',
          messageId: packet.messageId,
          granted: (packet.subscriptions ?? []).map(() => 0),
        }));
      }
    });
    socket.on('data', data => parser.parse(data));
    socket.on('error', () => undefined);
  });
  const tlsErrors: Error[] = [];
  server.on('tlsClientError', err => tlsErrors.push(err));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  return {
    port: (server.address() as AddressInfo).port,
    packets,
    sockets,
    clientCertificates,
    tlsErrors,
    publish(topic: string, payload: string) {
      sockets.at(-1)?.write(mqttPacket.generate({ cmd: 'publish', topic, payload, qos: 0, dup: false, retain: false }));
    },
    close: () => new Promise<void>(resolve => {
      sockets.forEach(socket => socket.destroy());
      server.close(() => resolve());
    }),
  };
}

async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    if (check()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for ' + what);
}

function connectData(ca = rootCa.certPem) {
  return {
    clientId: 'test-client-id',
    host: 'localhost',
    ca,
    key: clientIdentity.keyPem,
    cert: clientIdentity.certPem,
  };
}

describe('MQTT connection to LG', () => {
  let client: MqttClient | undefined;
  let server: Awaited<ReturnType<typeof startMqttServer>> | undefined;

  afterEach(async () => {
    client?.end(true);
    client = undefined;
    await server?.close();
    server = undefined;
  });

  test('uses MQTT 3.1.1 over TLS on port 8883, with the client certificate and a 5 minute keepalive', () => {
    expect(mqttClientOptions(connectData())).toEqual(expect.objectContaining({
      protocol: 'mqtts',
      host: 'localhost',
      port: MQTT_PORT,
      protocolVersion: 4,
      clientId: 'test-client-id',
      ca: rootCa.certPem,
      key: clientIdentity.keyPem,
      cert: clientIdentity.certPem,
      rejectUnauthorized: true,
      keepalive: MQTT_KEEPALIVE_SECONDS,
    }));
    expect(MQTT_PORT).toBe(8883);
    expect(MQTT_KEEPALIVE_SECONDS).toBe(300);
    // Above 0, or mqtt never emits the `offline` event the plugin reconnects on.
    expect(mqttClientOptions(connectData()).reconnectPeriod).toBeGreaterThan(0);
  });

  test('connects with the client certificate, subscribes, passes on messages, and reconnects when the server goes away', async () => {
    server = await startMqttServer();
    const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn() };
    const onMessage = jest.fn();
    const reconnect = jest.fn(async () => undefined);
    const scheduleReconnect = jest.fn();

    client = mqtt.connect({ ...mqttClientOptions(connectData()), port: server.port });
    wireMqttDeviceEvents({
      device: client,
      logger,
      mqttServer: 'ssl://localhost:8883',
      subscriptions: ['app/clients/test-client-id/push', 'app/clients/test-client-id/state'],
      onMessage,
      reconnect,
      scheduleReconnect,
    });

    await waitFor(() => server!.packets.some(packet => packet.cmd === 'subscribe'), 'the subscription');
    const connectPacket = server.packets.find(packet => packet.cmd === 'connect');
    expect(connectPacket).toEqual(expect.objectContaining({
      clientId: 'test-client-id',
      keepalive: 300,
      protocolVersion: 4,
    }));
    expect(server.clientCertificates).toEqual(['Test MQTT client']);
    const subscribed = server.packets
      .filter(packet => packet.cmd === 'subscribe')
      .flatMap(packet => (packet.subscriptions ?? []).map(subscription => subscription.topic));
    expect(subscribed).toEqual(['app/clients/test-client-id/push', 'app/clients/test-client-id/state']);
    expect(logger.info).toHaveBeenCalledWith('Successfully connected to the MQTT server.');

    server.publish('app/clients/test-client-id/push', JSON.stringify({ data: { state: { reported: { washer: 'END' } } } }));
    await waitFor(() => onMessage.mock.calls.length > 0, 'the message');
    expect(onMessage).toHaveBeenCalledWith({ data: { state: { reported: { washer: 'END' } } } });

    // The server drops the connection: the plugin closes the client and reconnects later.
    server.sockets.forEach(socket => socket.destroy());
    await waitFor(() => scheduleReconnect.mock.calls.length > 0, 'the reconnect');
    expect(scheduleReconnect).toHaveBeenCalledWith(expect.any(Function), MQTT_OFFLINE_RECONNECT_DELAY_MS);
    expect(logger.info).toHaveBeenCalledWith('MQTT disconnected, retrying in 60 seconds!');
    await waitFor(() => client!.disconnected, 'the client to close');

    // The closed client must not reconnect on its own (mqtt would try every second).
    const connections = server.sockets.length;
    await new Promise(resolve => setTimeout(resolve, 2500));
    expect(server.sockets.length).toBe(connections);
    expect(reconnect).not.toHaveBeenCalled();
  });

  test('refuses a server whose certificate is not signed by the root certificate from LG', async () => {
    server = await startMqttServer();
    const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn() };

    client = mqtt.connect({ ...mqttClientOptions(connectData(otherCa.certPem)), port: server.port });
    wireMqttDeviceEvents({
      device: client,
      logger,
      mqttServer: 'ssl://localhost:8883',
      subscriptions: ['app/clients/test-client-id/push'],
      onMessage: jest.fn(),
      reconnect: jest.fn(async () => undefined),
      scheduleReconnect: jest.fn(),
    });

    await waitFor(() => logger.error.mock.calls.length > 0, 'the TLS error');
    expect(String(logger.error.mock.calls[0][1])).toMatch(/certificate/i);
    expect(server.packets).toEqual([]);
    expect(logger.info).not.toHaveBeenCalledWith('Successfully connected to the MQTT server.');
  });
});
