Dial — compact single-color arc control for secondary parameters (mic levels, "MAIN", etc.).

```jsx
<Dial value={0.85} onChange={setV} color="var(--spectrum-violet)" label="MAIN" />
```

Pick `color` from a spectrum stop so several dials read as a set (CLOSE=cyan, MAIN=violet, ROOM=pink). The core and glow scale with value. Default size is 78px.
