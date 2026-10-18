# Infistar Sponsor Promotion Design

## Placement

The current partner appears after the contents and before the download section
in each README locale. This moves the campaign above the long product and
release content while keeping the project identity and navigation first. The
existing sponsor section remains the home of personal donation methods and does
not repeat the campaign.

README partner entries use a compact two-column table with linked banners
rendered at 280 pixels wide, preserving their aspect ratio and original bytes.
The complete approved text remains in a closed-by-default details section below
the table. This replaces the tall single-column layout at the maintainer's
request on 2026-10-18. The partner order and registration URLs are preserved.

The public sponsor record and the website backer pages carry the same disclosure
boundary. The website remains Chinese/English because those are its existing
backer-page locales; the repository README set remains aligned across all seven
supported documentation languages.

## Creative Boundary

- `docs/imgs/sponsors/infistar-banner.png` is the repository/README asset.
- `website/public/imgs/sponsors/infistar-banner.png` is an identical copy for
  the static website asset pipeline.
- Both assets preserve the supplied PNG bytes; the image is not resized,
  recompressed, recolored, or edited.
- All public surfaces reproduce the same sponsor-supplied Chinese title and
  body copy. Localized sponsor rewrites and PromptHub-authored notices are
  removed.
- The banner and the existing `专属推广链接` phrase point to the supplied
  `infistar.cc` registration URL. No other copy is changed.

## Complexity And Resources

This is static documentation with `O(1)` page size growth and two bounded image
copies, with no runtime memory, database, or API cost. Verification checks
asset hashes, exact campaign-copy parity, link parity, rendered website output,
and the website documentation build.
