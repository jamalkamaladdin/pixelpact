---
'pixelpact-core': minor
'pixelpact': minor
---

Read a Figma frame as the reference. `extract` recognises a Figma url and pulls the frame
through the REST API, so a contract can come from the design file instead of a live page. No
browser is launched for that step.

A Figma layer has no CSS selector, so a Figma contract binds to the implementation through
`data-contract` attributes, and anything with no match is reported as missing rather than
guessed from tag names.
