Knob — the hero control. A 270° masked-donut spectrum ring tracks the value over a recessed face with a white indicator and a big center readout. Drag vertically.

```jsx
const [amt, setAmt] = React.useState(0.74);
<Knob value={amt} onChange={setAmt} label="AMOUNT" />
```

Controlled: pass `value` (0..1) and `onChange`. Omit `onChange` for a static display. `size` scales all geometry from the 172px hero size; use ~128px for a compact panel knob. `format`/`unit` shape the center number.
