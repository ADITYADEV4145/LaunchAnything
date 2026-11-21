import { execFile } from 'node:child_process';

export interface Keychain {
  get(account: string): Promise<string | undefined>;
  set(account: string, token: string): Promise<void>;
  delete(account: string): Promise<void>;
}

export class MemoryKeychain implements Keychain {
  private tokens = new Map<string, string>();
  async get(account: string) { return this.tokens.get(account); }
  async set(account: string, token: string) { this.tokens.set(account, token); }
  async delete(account: string) { this.tokens.delete(account); }
}

function run(command: string, args: string[], input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(command, args, (error, stdout) => {
      if (error) reject(new Error('OS keychain unavailable or access denied; no token was stored'));
      else resolve(stdout.trim());
    });
    child.stdin?.end(input);
  });
}

export function osKeychain(platform = process.platform): Keychain {
  if (platform === 'linux') return {
    get: account => run('secret-tool', ['lookup', 'service', 'liftoff', 'account', account]),
    async set(account, token) { await run('secret-tool', ['store', '--label=Liftoff', 'service', 'liftoff', 'account', account], token); },
    async delete(account) { await run('secret-tool', ['clear', 'service', 'liftoff', 'account', account]); },
  };
  if (platform === 'darwin') return {
    get: account => run('security', ['find-generic-password', '-s', 'liftoff', '-a', account, '-w']),
    async set(account, token) {
      const quote = (value: string) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
      if (/[\r\n]/.test(token)) throw new Error('Token must be a single line');
      await run('security', ['-i'], `add-generic-password -U -s liftoff -a ${quote(account)} -w ${quote(token)}\n`);
    },
    async delete(account) { await run('security', ['delete-generic-password', '-s', 'liftoff', '-a', account]); },
  };
  throw new Error('OS keychain unsupported on this platform; use --token-env with a supported keychain backend');
}
