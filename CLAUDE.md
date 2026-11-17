# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JavaScript (HTML5 Canvas + CSS). No dependencies, no build step, no package manager, no tests, no linter. The README is in Spanish; UI strings (e.g. "PAUSA", "Puntuación") are too.

## Running

Open `index.html` directly, or serve statically (e.g. `python3 -m http.server 8000`) and visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (canvases `#board` 300×600 and `#next-canvas`, HUD elements, `#overlay` for pause/game over), `style.css`, and `game.js` (all logic, loaded as a classic script with `'use strict'`).

`game.js` is a single global-state module. Key points that span the file:

- **Board / pieces**: `board` is a `ROWS×COLS` matrix of color indices (0 = empty). `PIECES` and `COLORS` are indexed by the same piece type (1–7); the number inside a shape matrix *is* its color index, so adding a piece means adding to both arrays and updating the `Math.random() * 7` in `randomPiece()`.
- **Game loop**: `loop(ts)` is a `requestAnimationFrame` loop that accumulates `dropAccum` against `dropInterval` for gravity and calls `draw()` each frame. Pause/game over stop it via `cancelAnimationFrame(animId)`; `togglePause` and `init` restart it (and reset `lastTime` to avoid a large dt).
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the spawn position collides.
- **Scoring/levels** live in `clearLines()` (`LINE_SCORES × level`, level = lines/10 + 1, `dropInterval = max(100, 1000 − (level−1)·90)`), plus soft drop (+1/cell) and hard drop (+2/cell) in their handlers.
- **Rotation**: `tryRotate()` rotates the matrix clockwise and tries horizontal kicks `[0, -1, 1, -2, 2]` (no SRS tables, no counterclockwise).
- **Input**: single `keydown` listener using `e.code` (arrows, `KeyX`, `Space`, `KeyP`); ignored while paused or game over.
