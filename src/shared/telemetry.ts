// Handles serialising and dispatching a completed game payload
// to a backend endpoint or local session store.

export type AnyGamePayload = {
  sessionId: string;
  gameId: string;
  startedAt: string;
  completedAt: string;
  [key: string]: unknown;
};

export async function sendPayload(payload: AnyGamePayload, endpoint?: string): Promise<void> {
  if (!endpoint) {
    // TODO: wire up real backend endpoint
    console.info('[telemetry] payload ready', payload);
    return;
  }
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
