# Writing brief: devto

Write the post yourself; liftoff never generates or publishes copy.

## Grounded product facts and claim IDs

{
  "name": "Agent Linux",
  "oneLiner": "A source-built Linux desktop preview for agents on Apple silicon Macs",
  "audience": "Apple silicon Mac developers exploring supervised agent desktop workflows",
  "problem": "An agent and a person need a shared desktop with an explicit boundary for human control.",
  "proofPoints": [
    "The README describes a source-built local developer preview, not public binaries or a hosted service (README.md).",
    "The MCP command connects to existing machine state rather than starting the local VM (internal/cli/mcp.go).",
    "The viewer supports an interactive human-input mode (internal/cli/view.go)."
  ],
  "features": [
    {
      "name": "Source-built preview",
      "description": "Build the local developer preview for an Apple silicon Mac; the app is not notarized and no public VM image is published.",
      "sources": [
        {
          "type": "file",
          "ref": "README.md"
        },
        {
          "type": "file",
          "ref": "docs/launch-readiness.md"
        }
      ]
    },
    {
      "name": "Existing-machine MCP",
      "description": "Connect an MCP client to existing local machine state; start the VM separately.",
      "sources": [
        {
          "type": "file",
          "ref": "internal/cli/mcp.go"
        },
        {
          "type": "file",
          "ref": "docs/mcp.md"
        }
      ]
    },
    {
      "name": "Human handoff",
      "description": "Use the interactive viewer to take control of the same guest desktop.",
      "sources": [
        {
          "type": "file",
          "ref": "internal/cli/view.go"
        },
        {
          "type": "file",
          "ref": "docs/desktop.md"
        }
      ]
    }
  ],
  "claims": [
    {
      "id": "preview",
      "text": "Agent Linux is a source-built local developer preview for Apple silicon Macs; no public binaries or VM images are published and the app is not notarized.",
      "sources": [
        {
          "type": "file",
          "ref": "README.md"
        },
        {
          "type": "file",
          "ref": "docs/launch-readiness.md"
        }
      ]
    },
    {
      "id": "mcp",
      "text": "The MCP command connects to an existing local machine; it does not start the local VM.",
      "sources": [
        {
          "type": "file",
          "ref": "internal/cli/mcp.go"
        },
        {
          "type": "file",
          "ref": "docs/mcp.md"
        }
      ]
    },
    {
      "id": "handoff",
      "text": "The interactive viewer supports human input on the shared guest desktop.",
      "sources": [
        {
          "type": "file",
          "ref": "internal/cli/view.go"
        },
        {
          "type": "file",
          "ref": "docs/desktop.md"
        }
      ]
    },
    {
      "id": "limits",
      "text": "The README does not qualify real ARM64 guest agent runs or claim that hosted agents such as Devin run inside the VM; cloud and billing are development prototypes.",
      "sources": [
        {
          "type": "file",
          "ref": "README.md"
        },
        {
          "type": "file",
          "ref": "docs/launch-readiness.md"
        }
      ]
    }
  ]
}

Use only supported facts. Every sentence with a number or feature name needs [claim:id]. Declare all cited IDs in claims. Titles can carry citations too.

## Platform rules

{
  "kind": "platform",
  "id": "devto",
  "name": "DEV Community",
  "version": 2,
  "lastVerified": null,
  "verified": false,
  "verifiedFields": [],
  "verificationNotes": [
    "Source fetched but did not state the numeric copy limits. All numeric budgets are unverified local editorial limits, not platform guarantees."
  ],
  "sources": [
    "https://dev.to/terms"
  ],
  "title": {
    "required": true,
    "maxLength": 128
  },
  "body": {
    "minLength": 1,
    "maxLength": 30000
  },
  "maxLinks": 10,
  "requiredLink": false,
  "bannedWords": [],
  "guidance": [
    "Use a technical walkthrough and disclose affiliation."
  ]
}

## Founder voice

"Run liftoff voice learn with at least 20 owned samples."

Editorial limits are conservative local budgets, not guarantees of platform acceptance.

## Tone

Technical, concrete, no hype

## Brand voice

No brand kit supplied.

## Optional copywriting polish

copywriting skill not detected.

If present, run the copywriting skill after drafting; preserve facts and citations.

## Exact output format

Write .launch/posts/devto.md, with YAML front matter followed by Markdown:


```markdown
---
channel: devto
title: "A factual title"
media: []
claims: [claim-id]
# link: https://your-real-tryable-product.example
---
A factual sentence [claim:claim-id].
```

Do not include the code fence in the file. media entries are {slot, path?}. link is optional unless required by the platform.

For X threads separate posts with a line containing exactly --- (after front matter). Each post must fit independently.

For LinkedIn make the first paragraph a hook within 210 characters. For a first-comment link, set linkFirstComment: true and link: https://your-real-url in front matter; keep URLs out of the body. The link still counts toward maxLinks.

Product Hunt title is the tagline (60 characters). Body must contain a ## Maker comment section with text. Use gallery-1 etc. media slots for supplied gallery assets, adding width: 1270 and height: 760. When supplying gallery images, provide at least two. These sizes are unverified local budgets, not confirmed live requirements.

Reddit front matter must name subreddit: r/SideProject (or another configured target), optional flair: "Target flair", and selfPromotion: true (default). A configured flair requirement or forbidden self-promotion policy is enforced. Unknown targets fail. Restricted communities require manual review of permitted timing and topics.

Read verifiedFields and verificationNotes: null lastVerified means no constraint value was confirmed. Unverified policies are conservative local gates, not current platform guarantees. Show HN links must be ready to try now; live availability is a human check.

Run liftoff check; fix the rule IDs in fix-list.md and re-check. After three failed checks ask the user.
