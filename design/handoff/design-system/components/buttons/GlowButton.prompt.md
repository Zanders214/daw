Glow toggle button — wide pill with a square status dot and an outer color glow when engaged; use for any on/off transport control (STOP, SUSTAIN, PEDAL).

```jsx
<GlowButton engaged={on} idleLabel="STOP" variant="danger" onClick={() => setOn(!on)}>STOPPING</GlowButton>
```

Variants: `accent` (blue, default — selection/engage) and `danger` (red — STOP/destructive). Pass `idleLabel` to swap the caption between states; otherwise `children` shows in both. Height is fixed at 48px; it fills its container width.
