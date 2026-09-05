# pixelpact

## 0.3.0

### Minor Changes

- [`fb12404`](https://github.com/jamalkamaladdin/pixelpact/commit/fb1240499ee410b7988d98c328db7a6966a38de5) Thanks [@jamalkamaladdin](https://github.com/jamalkamaladdin)! - Add `side`, a section by section side by side comparison. It splits the reference and the
  implementation into sections, captures each pair at every requested width, boxes the differing
  pixels in red and writes one image per section together with a per section verdict.
  
  `check` reports which values moved and `diff` reports how many pixels moved. Neither shows a
  person where to look, which is what this command is for.

### Patch Changes

- Updated dependencies [[`fb12404`](https://github.com/jamalkamaladdin/pixelpact/commit/fb1240499ee410b7988d98c328db7a6966a38de5)]:
  - pixelpact-core@0.3.0

## 0.2.1

### Patch Changes

- [`d1876af`](https://github.com/jamalkamaladdin/pixelpact/commit/d1876af5ef2ba8a7e6df3720bc1665beb40de296) Thanks [@jamalkamaladdin](https://github.com/jamalkamaladdin)! - Accept `-o` as the short form of `--out`, which the documentation already used. A figma.com url
  with no readable file key now fails with a message that says so, instead of being loaded as an
  ordinary web page and producing a confusing complaint about flags.

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
