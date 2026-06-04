# Tasks

- [x] Inspect stable Skill behavior docs and current batch sync implementation.
- [x] Trace batch UI, renderer service, preload IPC, and main-process installer mode mapping.
- [x] Add component regression coverage for batch deploy mode selection.
- [x] Add filesystem regression coverage for copy mode with a symlinked root source directory.
- [x] Fix copy-mode installers to dereference symlinked root source directories before copying.
- [x] Enforce `data/Skills` as real files/directories only; no managed repo symlink roots.
- [x] Add lazy materialization for legacy managed repo symlinks.
- [x] Run targeted renderer service and main-process installer tests.
- [x] Record whether the reported reversal is reproduced.
