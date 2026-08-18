import { ref } from "vue";

/** Matches `server.rs` `PREFERRED_PORT`. Vite HMR stays on 1421. */
export const DEFAULT_PAIRING_PORT = 1422;
export const PAIRING_HANDSHAKE_TYPE = "pairing-handshake";

export type PairingQrPayload = {
  ip: string;
  pin: string;
  port: number;
};

/** Desktop QR JSON: `{"ip","pin","port"}`. Port is required so Android does not hit Vite HMR on 1421. */
export function pairingQrJson(ip: string, pin: string, port: number): string {
  return JSON.stringify({ ip, pin, port });
}

export function parsePairingQr(raw: string): PairingQrPayload | null {
  try {
    const parsed = JSON.parse(raw) as {
      ip?: unknown;
      pin?: unknown;
      port?: unknown;
    };
    if (typeof parsed.ip !== "string" || !parsed.ip.trim()) {
      return null;
    }
    if (typeof parsed.pin !== "string") {
      return null;
    }
    let port = DEFAULT_PAIRING_PORT;
    if (typeof parsed.port === "number" && Number.isInteger(parsed.port)) {
      port = parsed.port;
    } else if (typeof parsed.port === "string" && parsed.port.trim()) {
      const parsedPort = Number(parsed.port);
      if (Number.isInteger(parsedPort)) {
        port = parsedPort;
      }
    }
    return { ip: parsed.ip.trim(), pin: parsed.pin.trim(), port };
  } catch {
    return null;
  }
}

const isConnected = ref(false);
const isConnecting = ref(false);
const statusMessage = ref("");

let socket: WebSocket | null = null;

function formatConnectError(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not reach the desktop pairing server.";
}

function isUsableHost(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) {
    return true;
  }
  return /^[a-zA-Z0-9.-]+$/.test(trimmed);
}

function parseHandshakeStatus(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { status?: unknown };
    return typeof parsed.status === "string" ? parsed.status : null;
  } catch {
    return null;
  }
}

function waitForHandshakeReply(
  ws: WebSocket,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("No handshake reply. Check IP, port, and Wi-Fi."));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("error", onError);
    }

    function onMessage(event: MessageEvent) {
      if (typeof event.data !== "string") {
        return;
      }
      const status = parseHandshakeStatus(event.data);
      if (!status) {
        return;
      }
      cleanup();
      resolve(status);
    }

    function onClose() {
      cleanup();
      reject(new Error("Connection closed before handshake finished."));
    }

    function onError() {
      cleanup();
      reject(new Error("WebSocket error during handshake."));
    }

    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
  });
}

function dropSocket() {
  const current = socket;
  socket = null;
  if (!current) {
    return;
  }
  current.onclose = null;
  current.onerror = null;
  current.onmessage = null;
  try {
    current.close();
  } catch {
    // already closed
  }
}

function attachLifecycleListener(ws: WebSocket) {
  ws.onclose = () => {
    isConnected.value = false;
    statusMessage.value = "Disconnected from desktop.";
    socket = null;
  };
}

export async function connectWithPin(
  ip: string,
  port: number,
  pin: string,
): Promise<boolean> {
  const host = ip.trim();
  const trimmedPin = pin.trim();

  if (!isUsableHost(host)) {
    statusMessage.value = "Enter the desktop IP shown on the pairing screen.";
    return false;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    statusMessage.value = "Enter the pairing port shown on the desktop (default 1422).";
    return false;
  }
  if (!/^\d{6}$/.test(trimmedPin)) {
    statusMessage.value = "PIN must be 6 digits.";
    return false;
  }

  isConnecting.value = true;
  statusMessage.value = "Connecting…";
  isConnected.value = false;
  dropSocket();

  try {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const next = new WebSocket(`ws://${host}:${port}/`);
      const timer = window.setTimeout(() => {
        next.close();
        reject(new Error("Timed out connecting to the desktop pairing server."));
      }, 8000);
      next.onopen = () => {
        window.clearTimeout(timer);
        resolve(next);
      };
      next.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Could not reach the desktop pairing server."));
      };
    });
    socket = ws;
    ws.send(JSON.stringify({ type: PAIRING_HANDSHAKE_TYPE, pin: trimmedPin }));
    const status = await waitForHandshakeReply(ws, 8000);
    if (status !== "success") {
      dropSocket();
      statusMessage.value = "PIN was not accepted. Use the PIN on the desktop.";
      return false;
    }
    attachLifecycleListener(ws);
    isConnected.value = true;
    statusMessage.value = "Connected";
    return true;
  } catch (error) {
    dropSocket();
    isConnected.value = false;
    statusMessage.value = formatConnectError(error);
    return false;
  } finally {
    isConnecting.value = false;
  }
}

export function usePairingClient() {
  return {
    isConnected,
    isConnecting,
    statusMessage,
    connectWithPin,
  };
}
