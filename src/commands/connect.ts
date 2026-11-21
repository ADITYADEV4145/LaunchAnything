import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { commandOptions, output } from '../core/output.js';
import { connect, connections, platforms, removeConnection, routes, type Route } from '../connect/registry.js';
import { osKeychain, MemoryKeychain } from '../connect/keychain.js';

export function register(program: Command) {
  program.command('connect [platform]').description('Connect your own account; tokens go only to the OS keychain')
    .option('--route <route>', 'postiz, buffer, api or browser').option('--account <handle>', 'Your account handle')
    .option('--token-env <name>', 'Read token from this environment variable, never argv')
    .option('--profile <path>', 'Your Chrome user data directory').option('--list', 'List connected accounts')
    .option('--remove', 'Remove the selected connection and keychain token')
    .action(async (platform: string | undefined, options: { route?: Route; account?: string; tokenEnv?: string; profile?: string; list?: boolean; remove?: boolean }, command: Command) => {
      const { json } = commandOptions(command);
      if (options.list) { output('connect', await connections(), json); return; }
      const prompt = process.stdin.isTTY && !json ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
      try {
        platform ??= await prompt?.question(`Platform (${platforms.join(', ')}): `);
        if (!platform || !routes(platform).length) throw new Error('Choose a supported platform');
        const account = options.account ?? await prompt?.question('Your account handle: ');
        if (!account) throw new Error('--account is required');
        const existing = options.remove ? (await connections()).find(r => r.platform === platform && r.account === account) : undefined;
        const route = existing?.route ?? options.route ?? await prompt?.question(`Route (${routes(platform).join(', ')}): `) as Route;
        const keychain = route === 'browser' ? new MemoryKeychain() : osKeychain();
        if (options.remove) { await removeConnection(platform, account, keychain); output('connect', { removed: true }, json); return; }
        let token = options.tokenEnv ? process.env[options.tokenEnv] : undefined;
        if (route !== 'browser' && !options.tokenEnv && !process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
          token = Buffer.concat(chunks).toString('utf8').trim();
        }
        if (route !== 'browser' && !token) throw new Error('Provide a token via --token-env NAME or stdin');
        output('connect', await connect({ platform, route, account, profile: options.profile }, token, keychain), json);
      } finally { prompt?.close(); }
    });
}
