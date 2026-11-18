# Monster completion mattes

All 20 masks are extracted from the original 1536 × 1024 monster completion paintings. Levels 11–20 preserve continuous grayscale coverage for translucent edges, hair and smoke. For levels 1–10, `mattes/*.png` stores the thresholded image-generated extraction at its original coordinates; the JSON files bind each matte to its exact painting and record the reviewed background holes. The former half-resolution polygon outlines are retired.

Run `node scripts/build-monster-masks.mjs` (optionally followed by level IDs) to package masks and rebuild the corresponding sealed paintings and sealed portraits together. Interior drawing artifacts are filled, while explicitly reviewed holes between limbs, dangling linen, vines and wing edges remain clear. A two-pixel edge guard protects antialiased fringes, following the human mask workflow without smoothing the fine contour.

The packer never rewrites the completion paintings, rewards or rescued portraits. Build-time hashes cover the painting, extraction, runtime mask, seal and sealed portrait so a stale asset cannot silently replace a reviewed one. When replacing a matte, inspect the overlay against the source, revise its background-hole probes and source hashes, then rebuild and run the monster-mask and artwork-review tests.

Review's **查看 Alpha** displays the actual runtime mask. It overlays the same completion painting used by the game in every level.
