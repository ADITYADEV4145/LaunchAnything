---
channel: x
title: "GroundWork: inspect the source before changing it"
media: [{slot: image-1, path: media/images/x.png}]
claims: [navigation, grounding, reuse]
link: https://github.com/ADITYADEV4145/GroundWork
---
My project GroundWork searches a local code index and returns symbol locations and signatures for coding agents [claim:navigation].
---
Its edit hook checks new calls against source definitions; the stop hook reports duplicated implementations [claim:grounding] [claim:reuse].
---
The demo kit shows a real source lookup, not measured agent accuracy or a launch result. I'd like feedback on false alarms before making broader claims.
