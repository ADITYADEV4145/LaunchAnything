import { register as init } from './init.js';
import { register as scan } from './scan.js';
import { register as validate } from './validate.js';
import { register as plan } from './plan.js';
import { register as doctor } from './doctor.js';
import { register as selftest } from './selftest.js';
import { register as write } from './write.js';
import { register as check } from './check.js';
import { register as shots } from './shots.js';
import { register as images } from './images.js';
import { register as video } from './video.js';
import { register as review } from './review.js';
import { register as publish } from './publish.js';
import { register as results } from './results.js';
import { register as learn } from './learn.js';
import { register as receipt } from './receipt.js';
import { register as prelaunch } from './prelaunch.js';
import type { Command } from 'commander';
import { register as voice } from './voice.js';
import { register as research } from './research.js';
export function registerCommands(program: Command) {
  voice(program);
  for (const register of [research, init, scan, validate, plan, doctor, selftest, write, check, shots, images, video, review, publish, results, learn, receipt, prelaunch]) register(program);
}
