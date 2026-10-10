/* MealPR generated artifact — edit src/ instead. */

// src/entries/_io.ts
import { readFileSync } from "node:fs";
function readInput() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--file" || args[i] === "-f") && args[i + 1]) {
      const content = readFileSync(args[i + 1], "utf8");
      return args[i + 1].endsWith(".json") ? JSON.parse(content) : content;
    }
  }
  const positional = args.find((a) => !a.startsWith("-"));
  if (positional) return positional;
  const raw = readFileSync(0, "utf8");
  if (!raw.trim()) return "";
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  process.stdout.write("\n");
}
function fail(message, code = 1) {
  process.stderr.write(`${message}
`);
  process.exit(code);
}
function flag(name) {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] ?? "";
}
export {
  fail,
  flag,
  out,
  readInput
};
