# Design system

## Name and direction

**Examio** (pronounced “ex-AM-ee-oh”) is short, friendly, and clearly connected to exams. The interface is quiet, trustworthy, and colorful without becoming distracting.

## Color tokens

| Token | Hex | Use |
| --- | --- | --- |
| Sage | `#9CB080` | Accent, success, progress |
| Fern | `#618764` | Buttons, positive states |
| Pine | `#2B5748` | Primary brand, headings |
| Ink | `#273338` | Body text, dark surfaces |

Supporting tints are derived from these four colors for surfaces and borders. The main text/background combinations meet practical readability needs; decorative tints are not used for essential text.

## Typography

The product uses a local serif stack to avoid external font requests:

```css
font-family: Georgia, "Times New Roman", Times, serif;
```

Interface labels use the local system sans stack for clarity. This keeps the app fast, free, and privacy-friendly while giving headings and large numerals an editorial serif character.

## Layout and interaction

- 16px minimum body size
- 14px minimum task-critical labels
- 44px minimum interactive target height
- 16–24px corner radius for calm, contemporary surfaces
- Visible focus rings and reduced-motion support

