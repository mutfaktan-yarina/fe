# Project rules

## HTML / CSS: keep markup small

Do not put a class on a child element when that child is unique among its siblings inside a parent that already has a class.
Style it through the parent instead (`.card > h3`, `.card p`, `.card a`). Adding a class to every child inflates the HTML output.

```html
<!-- bad -->
<div class="card"><h3 class="card-title">Title</h3><p class="card-text">Text</p></div>

<!-- good -->
<div class="card"><h3>Title</h3><p>Text</p></div>
```
```css
.card > h3 { … }
.card > p  { … }
```

- Add a class to a child only when siblings of the same tag need different styling, or the same element is reused in many parents.
- Prefer the child combinator (`>`) for direct children; keep selectors to 3 levels or fewer.
- Use `id` or `data-*` as JS hooks; do not add a class only so JS can find an element.
- State classes (`active`, `open`, `hidden`, …) stay as classes.
- Apply this to new markup and to any markup you touch: remove redundant child classes and update the CSS selectors in the same change.
