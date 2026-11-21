import type { Command } from 'commander';
import { registerStub } from '../core/stub.js';
export function register(program: Command) { registerStub(program, 'publish', 5); }
