#!/usr/bin/env node
/**
 * intent.mjs — F01
 *   echo '{"text":"今天加班，帮我安排一个 40 元以内的麦当劳晚餐"}' | node intent.mjs
 *   echo '{"text":"预算降到 60","baseIntent":{...}}' | node intent.mjs
 */
import { buildQuestions, parseIntent, reviseIntent } from '../intent.js';
import { readInput, out } from './_io.js';

interface Input {
  text?: string;
  baseIntent?: unknown;
  raw?: unknown;
}

const input = readInput<Input | string>();
const payload: Input = typeof input === 'string' ? { text: input } : input;
const text = payload.text ?? '';

if (!text.trim()) {
  out({ ok: false, error: 'usage: echo \'{"text":"..."}\' | node intent.mjs' });
  process.exit(1);
}

const intent = payload.baseIntent
  ? reviseIntent(payload.baseIntent as never, text)
  : parseIntent(text);

out({
  ok: true,
  intent,
  questions: buildQuestions(intent.missing),
  complete: intent.missing.length === 0,
});
