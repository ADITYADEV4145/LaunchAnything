---
channel: show-hn
title: "Show HN: GroundWork, a local code map for coding agents"
media: []
claims: [navigation, reuse, grounding, runtime]
link: https://github.com/ADITYADEV4145/GroundWork
---
I'm sharing my project GroundWork: a local index that lets a coding agent find matching symbols and inspect file locations and signatures [claim:navigation].

The duplicate gate reports repeated implementations when the agent stops; the standard profile supplies context while strict mode can hold the stop [claim:reuse]. The grounding hook checks newly written calls against source definitions [claim:grounding].

The runtime uses local repository data rather than a hosted service; optional embedding setup downloads a model only with explicit consent [claim:runtime].

The attached kit captures an actual lookup against GroundWork's own source, not a benchmark comparison. It does not establish whether the tool improves an agent's final patch.

I'd value feedback on which code-navigation failures are hardest to notice during review. Which false alarms would make you disable a source-checking hook?
