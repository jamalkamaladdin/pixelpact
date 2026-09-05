---
'pixelpact-core': patch
---

Fix a Figma url that points at a page rather than a single frame. A page carries no bounding
box of its own, so every layer kept Figma's canvas coordinates and the contract recorded a one
pixel viewport. The design now starts at the origin and the viewport is the size of the
artboards on that page.

The size no longer grows to cover layers a frame clips away, and the page node itself is left
out of the contract, since a node with no box cannot be compared with anything in a browser.
