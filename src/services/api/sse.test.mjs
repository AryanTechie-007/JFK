import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSseBuffer } from './sse.js';

test('parseSseBuffer parses single block event', () => {
  const input = 'event: block\ndata: {"kind":"TEXT","text":"Hello world"}\n\n';
  const { events, remaining } = parseSseBuffer(input);

  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'block');
  assert.deepEqual(events[0].data, { kind: 'TEXT', text: 'Hello world' });
  assert.equal(remaining, '');
});

test('parseSseBuffer parses multiple events in one chunk', () => {
  const input =
    'event: block\ndata: {"kind":"TEXT","text":"First block"}\n\n' +
    'event: block\ndata: {"kind":"CHIP","label":"View Caps"}\n\n' +
    'event: done\ndata: {"turn_id":"turn-1","degraded":false}\n\n';

  const { events, remaining } = parseSseBuffer(input);

  assert.equal(events.length, 3);
  assert.equal(events[0].event, 'block');
  assert.equal(events[0].data.kind, 'TEXT');
  assert.equal(events[1].event, 'block');
  assert.equal(events[1].data.kind, 'CHIP');
  assert.equal(events[2].event, 'done');
  assert.equal(events[2].data.turn_id, 'turn-1');
  assert.equal(remaining, '');
});

test('parseSseBuffer preserves incomplete trailing chunk in remaining', () => {
  const chunk1 = 'event: block\ndata: {"kind":"TEXT","text":"Hello';
  const { events: ev1, remaining: rem1 } = parseSseBuffer(chunk1);

  assert.equal(ev1.length, 0);
  assert.equal(rem1, chunk1);

  const chunk2 = `${rem1}"}\n\n`;
  const { events: ev2, remaining: rem2 } = parseSseBuffer(chunk2);

  assert.equal(ev2.length, 1);
  assert.deepEqual(ev2[0].data, { kind: 'TEXT', text: 'Hello' });
  assert.equal(rem2, '');
});

test('parseSseBuffer handles empty buffer and whitespace gracefully', () => {
  const { events, remaining } = parseSseBuffer('   \n\n  ');
  assert.equal(events.length, 0);
  assert.equal(remaining.trim(), '');
});
