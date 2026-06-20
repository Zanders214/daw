Chip — small status tile (glowing dot + label + mono value) for effect-band rows.

```jsx
<Chip label="HPF" value="240 Hz" color="var(--spectrum-cyan)" active={amount > 0.2} />
```

Lay several in a `display:flex; gap:7px` row; each flexes to fill. Color the dot with the band's spectrum stop. Set `active={false}` to dim the chip when its band hasn't kicked in; `glow` (0..1) can track intensity.
