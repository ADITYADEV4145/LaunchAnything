---
channel: reddit
title: "I maintain GroundWork and would like feedback on code-navigation hooks"
subreddit: r/SideProject
selfPromotion: true
media: []
claims: [navigation, reuse, grounding]
link: https://github.com/ADITYADEV4145/GroundWork
---
I maintain GroundWork. It searches a local code index and returns symbol locations and signatures so an agent can inspect a concrete definition [claim:navigation].

The stop hook reports duplicated implementations, and an edit hook checks new calls against source definitions [claim:reuse] [claim:grounding]. These checks are feedback, not proof that a proposed patch is correct.

I'm preparing this as a maintainer draft, not reporting a launch outcome. Before sharing it, I'll review the community's current self-promotion rules myself.

If you've built developer tooling, where would you put the boundary between a warning and an interruption? I'd rather hear about the awkward cases than claim that a hook solves code review.
