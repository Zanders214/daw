Keyboard — a playable octave-tiling keyboard. White keys flex to fill; black keys overlay; keys glow + depress 2px on press.

```jsx
<div style={{height:96}}>
  <Keyboard whites={21} whiteFill="#e9edf1" blackFill="#11151b"
            accent="var(--spectrum-cyan)" keyBorder="rgba(0,0,0,0.35)"
            onPress={i => playNote(i)} onRelease={i => stopNote(i)} />
</div>
```

Give the wrapper a fixed height (the keyboard fills 100%). `accent` is the press glow — match the product color. `onPress`/`onRelease` receive a note index for driving voices/visuals.
