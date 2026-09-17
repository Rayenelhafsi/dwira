# Landing theme provenance

Reference: https://www.figma.com/design/pzB2yx3gCel8OEpARnzS28?node-id=2-107

The requested node `2:107` is **Quick Searches / Popular Residence**. Its parent
`2:41` is the complete landing frame. Both were read with Figma design context.

| Source | Extracted values |
| --- | --- |
| `2:41`, `2:43` | Blue `#70aae9`, white surface; 1440px page, 1200px content, 120px inset, 60px page corners |
| `2:108` | Gradient `#35393e` → `#31353a` at 6.25% → `#050810` at 74.417%; 108.351px upper-left corner; shadow 32px −16px 73px, rgba(10,13,17,.08) |
| `2:43` effects | Shadow −21px −15px 66px, rgba(27,35,55,.25) |
| `2:47`, `2:100` | Gilroy SemiBold, 48px title / normal leading; 18px lead / 150.68749% leading |
| `2:125`, `3:255` | Gilroy Medium, 28px section title / 142.1875% leading; 16px card text / normal leading; zero letter spacing |
| `2:87`, `3:254` | Muted text `#737579` on light, `#adadad` on dark |
| Image nodes | Approximately 186×190px, 10px corners, 55px horizontal gaps |
| `2:92`, `2:78` | 9.287px button corners |

Gilroy's source encodes weights in separate font family names (the API reports
400 for those faces). CSS maps Medium/SemiBold to semantic 500/600 when using a
unified Gilroy family. No licensed Gilroy font files are present; Segoe UI/system
sans-serif is the fallback. Supply licensed Gilroy webfonts for exact typography.

## Adaptations

- Tokens live in `landing-theme.css`, imported globally, with semantic overrides
  scoped to the landing route. Existing UI Card/Button components consume them.
- The existing home search, filters, partner branding, results and shared footer
  remain in use. Their component implementations and business logic are unchanged.
- The design's six New York images are editorial inspirations, not local listings.
  Images are exact Figma node exports, saved locally with the original cropping.
- The source has no stats, testimonials, or footer specification. Stats use the
  current catalogue counts, not availability counts. The testimonial section is
  an invitation to share feedback; no customer statements or ratings are fabricated.
  The existing shared footer receives the dark background token.
- Responsive insets, stacking, horizontal scrolling, focus styles, reduced motion,
  and the darker hero overlay are implementation adaptations. Existing functional
  search controls require more vertical space than the static reference form.

## Landing corrections

- Outer gutters now scale from 8px to 24px; page width may reach 1920px and section
  insets cap at 48px, per the request to reduce the reference's wide margins.
- Sales mode embeds the existing sales page's commercial cards. A portal places a
  compact landing filter presentation in the hero while keeping the existing sales
  state and filtering rules together with the results. Its three fields are
  Emplacement, Type de bien, and Caractéristiques; the last groups payment, budget,
  surface, bedrooms and facade. Both modes share the rounded search-panel styling.
  Seasonal rental keeps its own controls and PropertyCard. The standalone `/ventes`
  route retains its original filter layout.
- Hero copy is heavier and top-aligned over the sky. The normal duplicate hero logo
  is removed; navbar and partner branding remain. The image is top-aligned and
  extends under the Inspirations corner so the curve reveals imagery, not white.
- The inspiration rail hides its scrollbar while retaining touch, keyboard and
  arrow-button navigation.
- A page-level IntersectionObserver reveals headings, controls, cards and content
  groups with a short stagger. Dynamic results are observed too. Reduced-motion
  preferences disable reveals and cancel any active reveal animations.

Asset source nodes: hero `2:44`; residences `3:253`, `2:111`, `2:112`, `2:113`,
`2:122`, `2:109`; navigation icons `2:133`, `2:134`.
