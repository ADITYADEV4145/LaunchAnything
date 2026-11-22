# Writing brief: reddit

Write the post yourself; liftoff never generates or publishes copy.

## Grounded product facts and claim IDs

{
  "name": "GroundWork",
  "oneLiner": "A local code map and source-grounding checks for coding agents",
  "audience": "Developers using coding agents on existing repositories",
  "problem": "Agents need precise code locations and source definitions before changing an unfamiliar repository.",
  "proofPoints": [
    "The symbol command prints ranked matches with file locations and signatures (src/cli/commands/query.ts).",
    "The duplicate gate reports duplicated implementations when the agent stops; strict mode can hold the stop (src/hooks/handlers/duplicate_gate.ts).",
    "The grounding hook checks new calls against source definitions (src/hooks/handlers/grounding.ts)."
  ],
  "features": [
    {
      "name": "Symbol lookup",
      "description": "Search symbols and inspect their definitions through the local index.",
      "sources": [
        {
          "type": "file",
          "ref": "src/cli/commands/query.ts"
        },
        {
          "type": "file",
          "ref": "src/index/navigation.ts"
        }
      ]
    },
    {
      "name": "Reuse gate",
      "description": "Report duplicated implementations at agent stop; standard mode provides context and strict mode can hold the stop.",
      "sources": [
        {
          "type": "file",
          "ref": "src/hooks/handlers/duplicate_gate.ts"
        }
      ]
    },
    {
      "name": "Call grounding",
      "description": "Check new calls against source definitions through the agent hook.",
      "sources": [
        {
          "type": "file",
          "ref": "src/hooks/handlers/grounding.ts"
        }
      ]
    }
  ],
  "claims": [
    {
      "id": "navigation",
      "text": "GroundWork searches symbols through a local index and prints file locations and signatures.",
      "sources": [
        {
          "type": "file",
          "ref": "src/cli/commands/query.ts"
        },
        {
          "type": "file",
          "ref": "src/index/navigation.ts"
        }
      ]
    },
    {
      "id": "reuse",
      "text": "The duplicate gate reports duplicated implementations at agent stop; standard mode provides context and strict mode can hold the stop.",
      "sources": [
        {
          "type": "file",
          "ref": "src/hooks/handlers/duplicate_gate.ts"
        }
      ]
    },
    {
      "id": "grounding",
      "text": "The grounding hook checks new calls against source definitions.",
      "sources": [
        {
          "type": "file",
          "ref": "src/hooks/handlers/grounding.ts"
        }
      ]
    },
    {
      "id": "runtime",
      "text": "GroundWork uses a local index; its runtime does not require a hosted service. Optional embedding setup downloads a model only with explicit consent.",
      "sources": [
        {
          "type": "file",
          "ref": "README.md"
        },
        {
          "type": "file",
          "ref": "src/cli/commands/index-cmds.ts"
        }
      ]
    }
  ]
}

Use only supported facts. Every sentence with a number or feature name needs [claim:id]. Declare all cited IDs in claims. Titles can carry citations too.

## Platform rules

{
  "kind": "platform",
  "style": [
    "First person: tell the story of building and ask for specific feedback."
  ],
  "requiresAffiliationDisclosure": true,
  "id": "reddit",
  "name": "Reddit",
  "version": 2,
  "lastVerified": null,
  "verified": false,
  "verifiedFields": [],
  "verificationNotes": [
    "Reddiquette fetched but supplies no post length or subreddit-specific limits. All four subreddit rule fetches returned no content. Policies below are unverified conservative local gates, not verified live rules."
  ],
  "sources": [
    "https://support.reddithelp.com/hc/en-us/articles/205926439",
    "https://www.reddit.com/r/SideProject/about/rules.json",
    "https://www.reddit.com/r/webdev/about/rules.json",
    "https://www.reddit.com/r/programming/about/rules.json",
    "https://www.reddit.com/r/selfhosted/about/rules.json"
  ],
  "title": {
    "required": true,
    "maxLength": 300
  },
  "body": {
    "minLength": 1,
    "maxLength": 10000
  },
  "maxLinks": 2,
  "requiredLink": false,
  "bannedWords": [],
  "guidance": [
    "Subreddit rules override these budgets; self-promotion may be forbidden.",
    "Check pinned rules, required flair and disclosure manually; never auto-submit."
  ],
  "subreddits": {
    "r/SideProject": {
      "selfPromotion": "allowed",
      "flairRequired": false,
      "verified": false,
      "note": "Unverified conservative local policy, not a statement of current subreddit rules. Fetch returned no content on 2026-11-21; manually review before posting."
    },
    "r/webdev": {
      "selfPromotion": "restricted",
      "flairRequired": true,
      "verified": false,
      "note": "Unverified conservative local policy, not a statement of current subreddit rules. Fetch returned no content on 2026-11-21; manually review before posting."
    },
    "r/programming": {
      "selfPromotion": "forbidden",
      "flairRequired": false,
      "verified": false,
      "note": "Unverified conservative local policy, not a statement of current subreddit rules. Fetch returned no content on 2026-11-21; manually review before posting."
    },
    "r/selfhosted": {
      "selfPromotion": "restricted",
      "flairRequired": true,
      "verified": false,
      "note": "Unverified conservative local policy, not a statement of current subreddit rules. Fetch returned no content on 2026-11-21; manually review before posting."
    }
  }
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

Write .launch/posts/reddit.md, with YAML front matter followed by Markdown:


```markdown
---
channel: reddit
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
