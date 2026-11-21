import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { learnVoice, loadVoice } from '../voice/learn.js';
import { scoreVoice } from '../voice/score.js';
import { context } from '../copy/context.js';
import { parsePost } from '../copy/check.js';

export function register(program: Command) {
  const voice = program.command('voice').description('Measure your owned writing; never calls an LLM');
  voice.command('learn [inputs...]').option('--readme', 'Include README.md').option('--json', 'JSON output')
    .action((inputs: string[], options, command: Command) => {
      const globals = commandOptions(command);
      try { output('voice learn', learnVoice(globals.cwd ?? process.cwd(), inputs, options.readme), globals.json); }
      catch (error) { output('voice learn', undefined, globals.json, String(error)); }
    });
  voice.command('score').option('--channel <channel...>', 'Channels to score').option('--json', 'JSON output')
    .action((options, command: Command) => {
      const globals = commandOptions(command), cwd = globals.cwd ?? process.cwd();
      try {
        const profile = loadVoice(cwd);
        if (!profile) throw new Error('Run voice learn first');
        const ctx = context(cwd, options.channel);
        const drafts = ctx.channels.map(channel => {
          const post = parsePost(readFileSync(join(ctx.paths.posts, channel + '.md'), 'utf8'));
          return { channel, ...scoreVoice(post.body, profile, channel) };
        });
        const passed = drafts.every(d => d.passed);
        if (!passed) process.exitCode = 1;
        if (globals.json) console.log(JSON.stringify({ ok: passed, command: 'voice score', data: drafts }));
        else output('voice score', drafts);
      } catch (error) { output('voice score', undefined, globals.json, String(error)); }
    });
}
