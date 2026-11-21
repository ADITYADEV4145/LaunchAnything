#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const path = 'tasks.json';
const tasks = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
if (process.argv[2] === 'add') {
  tasks.push({ title: process.argv.slice(3).join(' '), done: false });
  writeFileSync(path, JSON.stringify(tasks, null, 2));
}
console.log(tasks.map((task, i) => `${i + 1}. [${task.done ? 'x' : ' '}] ${task.title}`).join('\n'));
