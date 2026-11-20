# Java Edition 1.19 texture animation support

The resource-pack animation metadata parser is implemented in
`src/render/texture_animation.js`.

It validates the `.png.mcmeta` `animation` section and resolves the sprite
frame for a game tick. Supported metadata includes:

- Vertical and horizontal strips, plus grids using explicit frame width/height.
- Default one-tick frame duration and custom `frametime`.
- Explicit frame order and per-frame `time`.
- The `interpolate` flag, preserved for a renderer implementation.
- Safe rejection of invalid image dimensions and invalid frame indices.

This is a parsing/timing foundation only. It does not yet upload animated frames
to the WebGL texture array, interpolate pixels, or animate block/item rendering.
Static textures remain the active rendering path until that integration is
implemented and tested. The helper follows the Java resource-pack metadata
shape; it is not a Bedrock flipbook implementation.

Regression tests are in `tests/texture_animation.test.js` and are registered in
`tests/run-node.mjs`.
