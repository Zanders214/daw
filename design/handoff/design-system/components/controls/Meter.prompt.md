Meter — read-only thin progress bar carrying the full spectrum ramp with a warm glow halo.

```jsx
<Meter value={0.72} />
<Meter value={speed} height={6} />
```

Use for levels you display but don't set: output, energy, tape speed. Not interactive — pair with a Slider if the user needs to change it. `gradient` defaults to the full four-stop ramp.
