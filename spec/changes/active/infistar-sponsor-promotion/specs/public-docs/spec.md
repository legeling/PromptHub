# Infistar Sponsor Promotion Delta

## Added Requirements

### `FR-INFISTAR-001`: Visible current sponsor entry

PromptHub's sponsor sections MUST identify Infistar.ai as a current sponsor and
model-service support partner and MUST provide the supplied affiliate
registration URL. In each README locale, the campaign block MUST appear after
the contents and before the download section so the offer is visible without
displacing the project introduction or primary download action.

### `FR-INFISTAR-002`: Commercial disclosure (superseded)

Superseded by `FR-INFISTAR-004`. The sponsor-approved creative MUST NOT receive
additional disclosure, qualification, or rewritten marketing text.

### `FR-INFISTAR-003`: No unconfirmed benefit promise (superseded)

Superseded by `FR-INFISTAR-004`. The maintainer explicitly approved the supplied
benefit line as part of the campaign copy and requires it to remain unchanged.

### `FR-INFISTAR-004`: Sponsor creative fidelity

Every public sponsor surface MUST use the supplied 1456 × 180 PNG without image
editing and MUST reproduce the supplied Chinese campaign title and five body
lines without rewriting or translation, except that the campaign title MUST use
the international-domain brand `infistar.cc` in place of `Infistar.ai`. The
only other content transformation is to link the banner and the existing
`专属推广链接` phrase to
`https://infistar.cc/register?aff=RX9CVLVQ&ref_source=link`.

README surfaces MUST show linked partner banners side by side in a compact
two-column table, with proportional display widths capped at 280 pixels.
Complete approved campaign text MUST remain available in a closed-by-default
`details` section. Image bytes, partner order and registration URLs stay intact.
This README layout supersedes the single-column requirement as requested on
2026-10-18. The public sponsor record and website backer pages retain their
existing full campaign layout.

## Scenarios

### `AC-INFISTAR-001`: Reader follows the partner offer

Given a reader on any supported README locale, the sponsor campaign exposes the
same banner and registration URL before the download section; expanding the
partner details reveals the approved copy.

### `AC-INFISTAR-002`: Public copy remains exact

When the campaign is rendered from any public sponsor surface, no translated
table, affiliate disclosure, qualification, or other PromptHub-authored copy is
inserted into the sponsor-provided material.

### `AC-INFISTAR-003`: Partner inventory expands

The README shows APIMart and Infistar side by side. Additional partners can use
subsequent table rows with their complete copy in the same details section.
