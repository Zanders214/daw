Panel — the dark-glass shell every plugin face sits in. Radial well + hairline border + deep outer drop shadow.

```jsx
<Panel width={360}>
  <header style={{display:'flex',justifyContent:'space-between'}}>
    <Wordmark product="PreDrop" color="var(--spectrum-pink)" />
    <Badge>BUILD-UP</Badge>
  </header>
  {/* controls… */}
</Panel>
```

Don't restyle the surface — keep the radial gradient, hairline, and drop. Lay a header row (Wordmark + Badge) at the top, then sections divided by `border-top: var(--border-hairline)`.
