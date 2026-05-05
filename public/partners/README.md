# Partner Images

Drop image files in this folder using these exact filenames:

| Partner | Filename | Type | Recommended size |
|---|---|---|---|
| Team Perez (Jorge) | `team-perez.jpg` | Portrait photo | 800 × 1000 px (4:5) |
| Voltex PT | `voltex-pt.png` | Logo | 1200 × 750 px, transparent PNG |
| Austin Sports Therapy | `austin-sports-therapy.png` | Logo | 1200 × 750 px, transparent PNG |

## How to get the assets

Easiest path: email each partner.

> "Hey, we're launching our updated website and we're featuring you in our network section at vivawellnessco.com/partners. Can you send over your logo (high-res, preferably PNG with transparent background) and any photo you'd like us to use? Want to make sure you're represented the way you'd want. Take a look at the page when you have a sec — viva-8nl.pages.dev/partners — and let me know if anything reads off."

That email does three things at once: it asks for assets, gives them a chance to review their representation, and reinforces that you're treating the partnership as a real one.

## What happens before the images arrive

The partners page already works without them. Each card has a typographic placeholder that uses the partner's initials — looks intentional, not broken. Once you drop a file in this folder with the right filename, the placeholder is automatically replaced.

## After dropping files in

```powershell
cd C:\dev\viva-wellness
git add .
git commit -m "Add partner images for [partner name]"
git push
```

Live in ~90 seconds. No code changes needed.

## File format notes

- **Photos** (Team Perez): JPG is fine, smaller files. Crop to 4:5 portrait orientation.
- **Logos** (Voltex, Austin Sports Therapy): PNG with transparency is best — looks cleanest on the warm paper background. Vector formats (SVG) work even better if they have one. Save as `voltex-pt.svg` or `austin-sports-therapy.svg` and update the `imageExt` field in `src/pages/partners.astro` from `'png'` to `'svg'` if so.
