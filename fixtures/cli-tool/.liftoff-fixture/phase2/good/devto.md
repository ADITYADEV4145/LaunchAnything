---
channel: devto
title: "A to-do list that is just a JSON file in your repo"
media: []
claims: [interface]
citations:
  - { text: "Every task tool I tried asked me to set something up before I could write the first task.", pain: 1 }
  - { text: "The CLI adds and lists tasks in a local JSON file.", claim: interface }
---
Every task tool I tried asked me to set something up before I could write the first task. I wanted the opposite: a list I could open in any editor, commit next to my code, and forget about until I needed it. This post walks through what I made, how it works, and where it still falls short.

## Before and after

Before, my tasks were spread across a notes app, a browser tab and a sticky note on the monitor. Each place had its own login or its own sync rules. When I switched machines, half of the list stayed behind. When I wanted to see what changed last week, I had nothing to compare.

After, the list is one file in the repository. The CLI adds and lists tasks in a local JSON file. I can read it with cat, change it with any editor, and see its history with git log. When I clone the project on a new laptop, the list comes with it.

The change is small, but it removed a whole category of friction. I stopped thinking about where the list lives. I started thinking about the tasks again.

## What you run

Here is the whole workflow from a fresh clone:

```bash
node bin/tasklight.js add "Write the release notes"
node bin/tasklight.js add "Reply to the open issue"
node bin/tasklight.js list
```

The first two commands append tasks. The last command prints them. There is nothing to configure, no account to create and no server to start.

## How it works

The script reads a JSON file from the current folder. If the file does not exist yet, it starts with an empty list. Adding a task pushes a new entry onto that list and writes the file back. Listing reads the file and prints each entry on its own line.

I kept the format plain on purpose. Each task is an object with a title and a done flag. That is enough for a person to read the file without the tool. It is also enough for another script to read it, which matters more than I expected.

Writing the file back in full keeps the code short. It also means a crash in the middle of a write could lose the list. For a personal checklist I accepted that risk, and I will come back to it in the limits.

There is no database and no background process. The tool starts, does one thing and exits. That makes it easy to reason about and easy to test. A test can create a temporary folder, run a command and read the JSON file it produced.

## Why a file instead of an app

A file is the most boring storage there is, and that is the point. Editors already know how to open it. Git already knows how to diff it. Backup tools already know how to copy it. By choosing a file, I got all of those features without writing any of them.

It also keeps the tool honest. If the tool disappears tomorrow, the list is still there and still readable. Nobody has to export anything.

Plain files also make the list easy to share. A teammate can open the same file in a pull request and see exactly which tasks changed. There is no separate permission system to learn and no invite to send.

## What I learned building it

The hardest part was not the code. It was resisting the urge to add features before I had used the tool for a few weeks. Every time I wanted a new flag, I wrote the idea down as a task in the list itself and waited.

Most of those ideas never came back. The few that did were small, like printing finished tasks in a different way. That habit kept the script short enough to read in one sitting, which is the main thing I wanted from it.

I also learned that people read the data file more often than the code. So I spent more time on a clear, stable format than on clever commands.

## Limits

This is a small personal tool, and it has real gaps.

It does not sync between machines on its own. If you want the list on two laptops, you commit and pull it like any other file.

It has no due dates, priorities or reminders. I left them out because I did not need them yet, and I did not want to guess at a format.

It rewrites the whole file on every change. That is fine for a short list but would be a poor fit for thousands of tasks or for several people writing at the same moment.

It has very little error handling. A hand-edited file with broken JSON will stop the tool until you fix the file.

## What I would like to hear

If you keep tasks in plain files already, I would like to know what you added that I left out. If you tried a tool like this and went back to an app, I would like to know what pulled you back. The repository is here: https://github.com/ADITYADEV4145/LaunchAnything/tree/main/fixtures/cli-tool

Which of the limits above would stop you from using it?
