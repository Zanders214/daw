Slider — thin rail with gradient fill + round handle and an optional label/value header row.

```jsx
<Slider label="TONE" valueLabel="60%" value={0.6} onChange={setTone} />
<Slider label="KEY NOISE" valueLabel="40%" value={0.4} onChange={setKey} gradient="var(--ramp-warm)" />
```

Use `var(--ramp-cool)` (default) for normal parameters and `var(--ramp-warm)` for character/noise params so the two groups read apart. Stack sliders in a `gap:15px` column or a 2-col grid.
