/**
 * Server clock sync. offset = serverTime - localTime, estimated from the lowest-RTT ping sample.
 * All countdowns render from server timestamps converted with this offset.
 */
let offset = 0;
let bestRtt = Number.POSITIVE_INFINITY;

export function recordSample(clientSent: number, serverTime: number, clientReceived: number): void {
  const rtt = clientReceived - clientSent;
  // Prefer tighter samples, but let the estimate drift if the network changes.
  if (rtt <= bestRtt * 1.5 || rtt < 60) {
    bestRtt = Math.min(bestRtt, rtt);
    offset = serverTime + rtt / 2 - clientReceived;
  }
}

export function resetClock(): void {
  bestRtt = Number.POSITIVE_INFINITY;
}

export function serverNow(): number {
  return Date.now() + offset;
}

/** Milliseconds left until a server timestamp. */
export function msUntil(serverTs: number): number {
  return Math.max(0, serverTs - serverNow());
}

export function clockOffset(): number {
  return offset;
}
