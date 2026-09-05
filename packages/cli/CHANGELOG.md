# pixelpact

## 0.2.0

### Minor Changes

- [`8b3c679`](https://github.com/jamalkamaladdin/pixelpact/commit/8b3c6798858c4d09143be591eaa023c75c82dbd0) Thanks [@jamalkamaladdin](https://github.com/jamalkamaladdin)! - Read a Figma frame as the reference. `extract` recognises a Figma url and pulls the frame
  through the REST API, so a contract can come from the design file instead of a live page. No
  browser is launched for that step.
  
  A Figma layer has no CSS selector, so a Figma contract binds to the implementation through
  `data-contract` attributes, and anything with no match is reported as missing rather than
  guessed from tag names.

### Patch Changes

- Updated dependencies [[`8b3c679`](https://github.com/jamalkamaladdin/pixelpact/commit/8b3c6798858c4d09143be591eaa023c75c82dbd0)]:
  - pixelpact-core@0.2.0

## 0.1.1

### Patch Changes

- [`523bbf3`](https://github.com/jamalkamaladdin/pixelpact/commit/523bbf3244ca8221fdc18cfcc1b4088cc85eedc8) Thanks [@jamalkamaladdin](https://github.com/jamalkamaladdin)! - Release from CI so every published tarball carries a signed provenance statement. The
  0.1.0 tarballs went out from a laptop and have no attestation, which means an installer
  cannot verify where they were built.
- Updated dependencies [[`523bbf3`](https://github.com/jamalkamaladdin/pixelpact/commit/523bbf3244ca8221fdc18cfcc1b4088cc85eedc8)]:
  - pixelpact-core@0.1.1
