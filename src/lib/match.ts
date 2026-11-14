import Peer, { type DataConnection } from "peerjs";
import {
  PLAYER_LABEL,
  otherPlayer,
  type PlayAction,
  type PlayState,
  type Player,
} from "../game/play";

/**
 * Matchmaking for the two-player starter map.
 *
 * A host reserves a short code as a PeerJS id. The opponent enters the code,
 * connects directly over WebRTC, and from then on the host is authoritative:
 * the guest sends actions, the host applies them and broadcasts the new state.
 * PeerJS's public broker is only used for the initial handshake.
 *
 * Two tabs in the same browser can also pair over BroadcastChannel with the
 * same code. That keeps the flow usable offline (and testable where WebRTC is
 * blocked); joining races the local probe against the PeerJS connection.
 */

export const CODE_LENGTH = 5;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PEER_PREFIX = "sector-gridfall-";
const OPEN_TIMEOUT = 15_000;
const HOST_OPEN_TIMEOUT = 4_000;
const LOCAL_PROBE_TIMEOUT = 900;

export type MatchRole = "host" | "guest";

export type NetMessage =
  | { kind: "welcome"; state: PlayState }
  | { kind: "state"; state: PlayState }
  | { kind: "action"; action: PlayAction }
  | { kind: "ready"; player: Player }
  | { kind: "forfeit"; player: Player }
  | { kind: "bye" };

export interface MatchHandle {
  role: MatchRole;
  player: Player;
  code: string;
  /** Host only: the state sent to the guest as soon as they connect. */
  startState: PlayState | null;
  /** Latest state seen on the wire, so a fast welcome cannot be missed. */
  lastState: PlayState | null;
  onPaired: (() => void) | null;
  onState: ((state: PlayState) => void) | null;
  onMessage: ((message: NetMessage) => void) | null;
  onEnd: ((reason: string) => void) | null;
  onError: ((message: string) => void) | null;
  send(message: NetMessage): void;
  leave(): void;
}

export class MatchError extends Error {}

export function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
}

function peerIdFor(code: string): string {
  return `${PEER_PREFIX}${code}`;
}

function errorType(error: unknown): string {
  if (typeof error === "object" && error !== null && "type" in error) {
    return String((error as { type: unknown }).type);
  }
  return "";
}

function friendlyError(error: unknown, joining: boolean): string {
  const type = errorType(error);
  if (type === "peer-unavailable") {
    return "No one is hosting with that code. Check the code and try again.";
  }
  if (type === "unavailable-id") {
    return "That game code was just taken. Please host again.";
  }
  if (type === "browser-incompatible") {
    return "This browser does not support peer-to-peer play.";
  }
  if (type === "network" || type === "server-error" || type === "socket-error") {
    return "Could not reach the matchmaking service. Check your internet connection.";
  }
  if (error instanceof Error && error.message) return error.message;
  return joining
    ? "Could not join that game. Try again."
    : "Could not host a game. Try again.";
}

function waitForPeer(peer: Peer, timeout = OPEN_TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new MatchError("The matchmaking service did not respond. Try again."));
    }, timeout);

    const cleanup = () => {
      window.clearTimeout(timer);
      peer.off("open", onOpen);
      peer.off("error", onError);
    };

    const onOpen = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    peer.on("open", onOpen);
    peer.on("error", onError);
  });
}

function waitForConnection(connection: DataConnection): Promise<void> {
  if (connection.open) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new MatchError("The connection timed out. Check the code and try again."));
    }, OPEN_TIMEOUT);

    const cleanup = () => {
      window.clearTimeout(timer);
      connection.off("open", onOpen);
      connection.off("error", onError);
    };

    const onOpen = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    connection.on("open", onOpen);
    connection.on("error", onError);
  });
}

/** The small set of operations the match needs from any transport. */
interface Transport {
  onMessage: ((message: NetMessage) => void) | null;
  onClose: (() => void) | null;
  send(message: NetMessage): void;
  close(): void;
}

/** A PeerJS data connection, used for cross-device play. */
class ConnectionTransport implements Transport {
  onMessage: ((message: NetMessage) => void) | null = null;
  onClose: (() => void) | null = null;

  private closed = false;
  private readonly connection: DataConnection;

  constructor(connection: DataConnection) {
    this.connection = connection;
    connection.on("data", (message) => this.onMessage?.(message as NetMessage));
    connection.on("close", () => this.onClose?.());
    connection.on("error", () => this.onClose?.());
  }

  send(message: NetMessage): void {
    if (this.closed || !this.connection.open) return;
    try {
      this.connection.send(message);
    } catch {
      // The close handler will return the tab to matchmaking.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.connection.close();
    } catch {
      // Ignore close errors during teardown.
    }
  }
}

/*
 * Same-browser fallback. A host listens on a BroadcastChannel named after its
 * game code; a guest posts a hello, the host replies with the opening state,
 * and both sides then relay the normal NetMessages over the channel.
 */

type LocalEnvelope =
  | { kind: "hello"; nonce: string }
  | { kind: "busy"; nonce: string }
  | { kind: "relay"; nonce: string; message: NetMessage }
  | { kind: "close"; nonce: string };

function channelNameFor(code: string): string {
  return peerIdFor(code);
}

function localNonce(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class ChannelTransport implements Transport {
  onMessage: ((message: NetMessage) => void) | null = null;
  onClose: (() => void) | null = null;

  private closed = false;
  private readonly channel: BroadcastChannel;
  private readonly nonce: string;
  private readonly busyOnHello: boolean;
  private readonly handlePageHide = () => {
    if (this.closed) return;
    try {
      this.channel.postMessage({
        kind: "close",
        nonce: this.nonce,
      } satisfies LocalEnvelope);
    } catch {
      // The page is going away; nothing else to do.
    }
  };

  constructor(channel: BroadcastChannel, nonce: string, busyOnHello = false) {
    this.channel = channel;
    this.nonce = nonce;
    this.busyOnHello = busyOnHello;
    channel.onmessage = (event) => this.receive(event.data);
    window.addEventListener("pagehide", this.handlePageHide);
  }

  private receive(data: unknown): void {
    if (this.closed) return;
    const envelope = data as LocalEnvelope | null;
    if (!envelope || typeof envelope !== "object") return;

    if (this.busyOnHello && envelope.kind === "hello") {
      // This host already has two players; turn later joiners away quickly.
      this.channel.postMessage({
        kind: "busy",
        nonce: envelope.nonce,
      } satisfies LocalEnvelope);
      return;
    }

    if (!("kind" in envelope) || envelope.nonce !== this.nonce) return;

    if (envelope.kind === "relay") {
      this.onMessage?.(envelope.message);
    } else if (envelope.kind === "close") {
      this.onClose?.();
    }
  }

  send(message: NetMessage): void {
    if (this.closed) return;
    try {
      this.channel.postMessage({
        kind: "relay",
        nonce: this.nonce,
        message,
      } satisfies LocalEnvelope);
    } catch {
      // A closed channel behaves like a dropped connection.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener("pagehide", this.handlePageHide);
    try {
      this.channel.postMessage({
        kind: "close",
        nonce: this.nonce,
      } satisfies LocalEnvelope);
    } catch {
      // Already unusable; closing again is harmless.
    }
    this.channel.onmessage = null;
    this.channel.close();
  }
}

interface LocalHostBridge {
  /** Stop listening. A no-op once the bridge has handed off to a transport. */
  close(): void;
}

function createLocalHostBridge(
  session: MatchSession,
  code: string,
  onLocalPair: () => void,
): LocalHostBridge | null {
  if (typeof BroadcastChannel !== "function") return null;

  const channel = new BroadcastChannel(channelNameFor(code));
  let stopped = false;

  channel.onmessage = (event) => {
    if (stopped) return;
    const envelope = event.data as LocalEnvelope | null;
    if (!envelope || envelope.kind !== "hello") return;
    if (typeof envelope.nonce !== "string") return;

    if (session.hasTransport() || session.isClosed) {
      channel.postMessage({
        kind: "busy",
        nonce: envelope.nonce,
      } satisfies LocalEnvelope);
      return;
    }

    // The transport takes over the channel; the bridge must not close it.
    stopped = true;
    session.attachTransport(new ChannelTransport(channel, envelope.nonce, true));
    onLocalPair();
  };

  return {
    close() {
      if (stopped) return;
      stopped = true;
      channel.onmessage = null;
      channel.close();
    },
  };
}

type LocalProbe =
  | { status: "found"; state: PlayState; channel: BroadcastChannel; nonce: string }
  | { status: "busy" }
  | { status: "none" };

function probeLocalHost(code: string): Promise<LocalProbe> {
  if (typeof BroadcastChannel !== "function") {
    return Promise.resolve({ status: "none" });
  }

  const channel = new BroadcastChannel(channelNameFor(code));
  const nonce = localNonce();

  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      channel.onmessage = null;
      channel.close();
      resolve({ status: "none" });
    }, LOCAL_PROBE_TIMEOUT);

    channel.onmessage = (event) => {
      if (settled) return;
      const envelope = event.data as LocalEnvelope | null;
      if (!envelope || envelope.nonce !== nonce) return;

      if (
        envelope.kind === "relay" &&
        envelope.message.kind === "welcome"
      ) {
        settled = true;
        window.clearTimeout(timer);
        resolve({
          status: "found",
          state: envelope.message.state,
          channel,
          nonce,
        });
        return;
      }

      if (envelope.kind === "busy") {
        settled = true;
        window.clearTimeout(timer);
        channel.onmessage = null;
        channel.close();
        resolve({ status: "busy" });
      }
    };

    channel.postMessage({ kind: "hello", nonce } satisfies LocalEnvelope);
  });
}

class MatchSession implements MatchHandle {
  readonly role: MatchRole;
  readonly player: Player;
  readonly code: string;
  readonly startState: PlayState | null;
  lastState: PlayState | null;

  onPaired: (() => void) | null = null;
  onState: ((state: PlayState) => void) | null = null;
  onMessage: ((message: NetMessage) => void) | null = null;
  onEnd: ((reason: string) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  private transport: Transport | null = null;
  private opened = false;
  private closed = false;
  private readonly cleanup: (() => void) | null;

  constructor(
    role: MatchRole,
    player: Player,
    code: string,
    startState: PlayState | null,
    cleanup: (() => void) | null = null,
  ) {
    this.role = role;
    this.player = player;
    this.code = code;
    this.startState = startState;
    this.lastState = startState;
    this.cleanup = cleanup;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  hasTransport(): boolean {
    return this.transport !== null;
  }

  attachTransport(transport: Transport, ready: Promise<void> = Promise.resolve()): void {
    if (this.closed || this.transport) {
      transport.close();
      return;
    }

    this.transport = transport;
    transport.onMessage = (message) => this.handleMessage(message);
    transport.onClose = () => this.finish("Your opponent left the match.");

    ready.then(
      () => {
        if (this.transport !== transport || this.closed || this.opened) return;
        this.handleOpen();
      },
      () => {
        if (this.transport !== transport) return;
        this.finish("The connection to your opponent failed.");
      },
    );
  }

  reportError(message: string): void {
    if (this.closed) return;
    this.onError?.(message);
  }

  private handleOpen(): void {
    if (this.opened || this.closed) return;
    this.opened = true;
    if (this.role === "host" && this.startState) {
      this.send({ kind: "welcome", state: this.startState });
    }
    this.onPaired?.();
  }

  private handleMessage(raw: unknown): void {
    const message = raw as NetMessage | null;
    if (!message || typeof message !== "object" || !("kind" in message)) return;

    switch (message.kind) {
      case "welcome":
      case "state":
        if (this.role !== "guest") return;
        this.lastState = message.state;
        this.onState?.(message.state);
        return;
      case "forfeit": {
        const winner = otherPlayer(message.player);
        const won = winner === this.player;
        this.finish(
          `${PLAYER_LABEL[message.player]} forfeited. ${
            won ? "You win!" : `${PLAYER_LABEL[winner]} wins.`
          }`,
        );
        return;
      }
      case "bye":
        this.finish("Your opponent left the match.");
        return;
      case "action":
        if (this.role !== "host") return;
        this.onMessage?.(message);
        return;
      case "ready":
        this.onMessage?.(message);
        return;
      default:
        return;
    }
  }

  send(message: NetMessage): void {
    this.transport?.send(message);
  }

  leave(): void {
    if (this.closed) return;
    this.transport?.send({ kind: "bye" });
    this.closed = true;
    this.transport?.close();
    this.cleanup?.();
  }

  /** Tear down without telling the UI that the match ended. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport?.close();
    this.cleanup?.();
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.transport?.close();
    this.cleanup?.();
    this.onEnd?.(reason);
  }
}

export async function hostMatch(startState: PlayState): Promise<MatchHandle> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = generateCode();
    const peer = new Peer(peerIdFor(code), { debug: 0 });
    let bridge: LocalHostBridge | null = null;

    const session = new MatchSession("host", "a", code, startState, () => {
      bridge?.close();
      bridge = null;
      try {
        peer.destroy();
      } catch {
        // Peer is already gone.
      }
    });

    bridge = createLocalHostBridge(session, code, () => {
      // A same-browser opponent is connected, so the internet peer is spare.
      const active = bridge;
      bridge = null;
      active?.close();
      try {
        peer.destroy();
      } catch {
        // Peer is already gone.
      }
    });

    let acceptedRemote = false;
    peer.on("connection", (connection) => {
      if (acceptedRemote || session.hasTransport() || session.isClosed) {
        connection.close();
        return;
      }
      acceptedRemote = true;
      bridge?.close();
      bridge = null;
      session.attachTransport(
        new ConnectionTransport(connection),
        waitForConnection(connection),
      );
    });
    peer.on("error", (error) => {
      if (session.isClosed) return;
      if (errorType(error) === "unavailable-id") {
        session.reportError("That game code was just taken. Please host again.");
      }
    });

    try {
      await waitForPeer(peer, HOST_OPEN_TIMEOUT);
      return session;
    } catch (error) {
      if (errorType(error) === "unavailable-id") {
        session.dispose();
        continue;
      }

      // The broker is unreachable, but tabs in this browser can still pair.
      try {
        peer.destroy();
      } catch {
        // Peer is already gone.
      }
      return session;
    }
  }

  throw new MatchError("Could not reserve a game code. Please try again.");
}

export async function joinMatch(rawCode: string): Promise<MatchHandle> {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    throw new MatchError(
      `Enter the full ${CODE_LENGTH}-character game code from the host.`,
    );
  }

  // Try the same-browser route first: it is instant and works offline.
  const local = await probeLocalHost(code);
  if (local.status === "busy") {
    throw new MatchError("That game already has two players.");
  }
  if (local.status === "found") {
    const session = new MatchSession("guest", "b", code, null);
    session.lastState = local.state;
    session.attachTransport(new ChannelTransport(local.channel, local.nonce));
    return session;
  }

  const peer = new Peer({ debug: 0 });
  try {
    await waitForPeer(peer);
  } catch (error) {
    peer.destroy();
    throw new MatchError(friendlyError(error, true));
  }

  const connection = peer.connect(peerIdFor(code), { reliable: true });
  const ready = waitForConnection(connection);
  const session = new MatchSession("guest", "b", code, null, () => {
    try {
      peer.destroy();
    } catch {
      // Peer is already gone.
    }
  });
  session.attachTransport(new ConnectionTransport(connection), ready);

  try {
    await ready;
  } catch (error) {
    session.dispose();
    throw new MatchError(friendlyError(error, true));
  }

  return session;
}
