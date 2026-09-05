---
'pixelpact-core': minor
---

Read Figma text and effect styles as tokens, beside the color styles already read. A text style
becomes a css font shorthand such as `600 60px/72px Geist` and an effect style becomes a box
shadow, so both can be compared against a browser without any translation step.

A stroke style also carries the type `FILL` in the api, and was previously able to take the
background color of whatever it was applied to. Only the fill slot contributes a color now.
