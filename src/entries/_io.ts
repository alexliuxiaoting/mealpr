/** Shared stdio plumbing for the generated scripts. */
import { readFileSync } from 'node:fs';

export function readInput<T = unknown>(): T {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--file' || args[i] === '-f') && args[i + 1]) {
      const content = readFileSync(args[i + 1]!, 'utf8');
      return (args[i + 1]!.endsWith('.json') ? JSON.parse(content) : content) as T;
    }
  }
  const positional = args.find((a) => !a.startsWith('-'));
  if (positional) return positional as unknown as T;
  const raw = readFileSync(0, 'utf8');
  if (!raw.trim()) return '' as unknown as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export function out(value: unknown): void {
  process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  process.stdout.write('\n');
}

export function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function flag(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] ?? '';
}
