# GroundWork recommendation regression evidence

`groundwork-community-pains.json` preserves the Groundwork research input from
`tests/communities.test.ts`'s `setup()` (pain tracking and its builders quote).
The recommendation gate combines it with the existing Part E
`communities-evidence.json` and runs `reportCommunities` to derive counts,
rules, eligibility and observed hours, rather than fabricating a report.

These are offline regression fixtures, not live GroundWork market research.
No dedicated GroundWork Part A research recording exists in this repository.
