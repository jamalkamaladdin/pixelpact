---
'pixelpact-core': minor
'pixelpact': minor
---

Add `side`, a section by section side by side comparison. It splits the reference and the
implementation into sections, captures each pair at every requested width, boxes the differing
pixels in red and writes one image per section together with a per section verdict.

`check` reports which values moved and `diff` reports how many pixels moved. Neither shows a
person where to look, which is what this command is for.
