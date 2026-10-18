/**
 * Interactive stdin helpers for prompts that shouldn't be passed on the command
 * line (chiefly passwords). Uses raw-mode masking when attached to a TTY.
 */
import readline from 'node:readline';

export function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Prompt without echoing keystrokes. Falls back to plain input off-TTY. */
export function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) return ask(question);
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = (ch: string) => {
      const code = ch.charCodeAt(0);
      if (code === 13 || code === 10 || code === 4) {
        // Enter (CR/LF) or Ctrl-D
        finish();
      } else if (code === 3) {
        // Ctrl-C
        process.stdout.write('\n');
        process.exit(130);
      } else if (code === 127 || code === 8) {
        // Backspace / Delete
        if (value.length > 0) value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}
