/**
 * SSE Stream Parser & Client (SC §17.4, John §C.2, WS-UI-P3).
 *
 * Implements fetch + ReadableStream parser for POST /api/v1/chat.
 * Emits `block` and `done` events, supports cancel/abort, and handles
 * both text/event-stream chunks and JSON response envelopes.
 */

/**
 * Parses raw SSE text buffer into individual events.
 * Returns array of parsed events: [{ event, data }].
 * Updates remainingBuffer with incomplete trailing text.
 */
export function parseSseBuffer(buffer) {
  const events = [];
  // Split on double newlines (SSE event boundary)
  const parts = buffer.split(/\r?\n\r?\n/);
  // Last part is either empty (if ended on boundary) or incomplete chunk
  const remaining = parts.pop() || '';

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = 'message';
    let dataStr = '';

    const lines = part.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const val = line.slice(5).trim();
        dataStr = dataStr ? `${dataStr}\n${val}` : val;
      }
    }

    if (dataStr) {
      try {
        const parsed = JSON.parse(dataStr);
        events.push({ event: eventType, data: parsed });
      } catch {
        events.push({ event: eventType, data: dataStr });
      }
    }
  }

  return { events, remaining };
}

/**
 * Sends a chat request and consumes the streaming response.
 */
export async function streamChat({
  url = 'http://localhost:4000/api/v1/chat',
  body = {},
  headers = {},
  signal,
  onBlock,
  onDone,
  onError,
}) {
  const token = typeof localStorage !== 'undefined'
    ? localStorage.getItem('finmate_token') || localStorage.getItem('finmate_auth_token') || sessionStorage.getItem('finmate_token')
    : null;

  const reqHeaders = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const err = new Error(errData?.error?.message || errData?.message || `HTTP ${res.status}`);
      err.status = res.status;
      if (onError) onError(err);
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';

    // Case 1: Standard JSON response (e.g. ChatResponse@1 envelope)
    if (contentType.includes('application/json')) {
      const json = await res.json();
      if (Array.isArray(json.blocks)) {
        for (const blk of json.blocks) {
          if (onBlock) onBlock(blk);
        }
      } else if (json.reply || json.text) {
        if (onBlock) onBlock({ kind: 'TEXT', text: json.reply || json.text });
      }
      if (Array.isArray(json.proposals)) {
        for (const p of json.proposals) {
          if (onBlock) onBlock({ kind: 'CARD', proposal_id: p.proposal_id || p.id, proposal: p });
        }
      }
      if (onDone) {
        onDone({
          turn_id: json.request_id || 'turn_done',
          trace_id: json.trace_id,
          degraded: Boolean(json.degraded),
          raw: json,
        });
      }
      return json;
    }

    // Case 2: SSE stream
    if (!res.body) {
      throw new Error('ReadableStream not supported on this response.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSseBuffer(buffer);
      buffer = remaining;

      for (const ev of events) {
        if (ev.event === 'block' && onBlock) {
          onBlock(ev.data);
        } else if (ev.event === 'done' && onDone) {
          onDone(ev.data);
        } else if (ev.event === 'error' && onError) {
          onError(new Error(ev.data?.message || 'SSE stream error'));
        }
      }
    }

    // Flush any remaining buffer
    if (buffer.trim()) {
      const { events } = parseSseBuffer(`${buffer}\n\n`);
      for (const ev of events) {
        if (ev.event === 'block' && onBlock) onBlock(ev.data);
        if (ev.event === 'done' && onDone) onDone(ev.data);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (onDone) onDone({ turn_id: 'aborted', interrupted: true });
      return;
    }
    if (onError) onError(err);
    throw err;
  }
}
