# UI, Visual Design & Mobile Guidelines — UrbanScope

Read this guide before making **any** HTML, CSS, or frontend UI edit. Every rule below reflects explicit design decisions and user expectations across public, client, and admin pages.

---

## 1. Core Visual Invariants

1. **Zero CSS Gradients (Flat / Solid-Color System):**
   - Never use `linear-gradient`, `radial-gradient`, or `conic-gradient` for backgrounds, buttons, banners, overlays, cards, or skeletons.
   - Reuse color, border, surface, and motion tokens from [`../frontend/shared/css/tokens.css`](../frontend/shared/css/tokens.css) and shared layout primitives from [`../frontend/shared/css/common.css`](../frontend/shared/css/common.css).
   - Feature-specific styles belong in that feature's own `.css` file.

2. **Native `1:1` Resolution (Zero CSS `zoom:`):**
   - Never introduce `zoom:` rules (desktop renders at native `100%` scale).
   - Align wide desktop layouts cleanly inside `@media (min-width: 1600px)` without breaking `125%` browser zoom (`~1536px`, `< 1600px`) or narrower viewports.

3. **Light & Dark Mode Parity:**
   - Every new or edited UI element MUST look clean and readable in both **Light Mode** and **Dark Mode** (`html.dark-mode` / `html[data-theme="dark"]`).
   - Keep `<meta name="color-scheme" content="light">` as the HTML default so OS dark mode never forces gray scrollbars or dark native checkboxes before theme hydration.
   - Never hardcode bright white backgrounds or dark text colors without matching Dark Mode overrides or semantic CSS variables.

4. **Zero Frameworks or Browser Dependencies:**
   - Pure HTML5 + vanilla CSS3 + vanilla ES6 JavaScript only (no React, Tailwind, jQuery, or bundlers).
   - Always escape user-provided content before inserting into HTML (`esc()` / `escapeHtml()`).

---

## 2. Prohibited UI Patterns (Do Not Re-Introduce)

These patterns were explicitly removed by the user — never add them back:

| Avoid | Use Instead |
| :--- | :--- |
| Thick left-border accent stripes (`border-left: 3px–5px solid ...`) on cards, agenda items, callouts, message boxes, toasts, or nav links | Uniform `1px` rounded borders (`border-radius: 10px–16px`). *(Thin `1px` vertical dividers inside split action buttons are fine.)* |
| Colored indicator dots inside admin status pills, filter dropdowns, property/Google status badges, or modal decision options | Clean text + semantic pill background/border colors. *(Keep functional donut chart legend keys `.donut-legend .dot`, calendar event dots `.note-dot`/`.legend-dot`, and the client navbar password-setup reminder dot.)* |
| Warm / orange icon badges (`.card-header-icon.warm`) on settings cards | Unified green `.card-header-icon` across all profile/settings cards in both Light & Dark Mode |
| Native browser `alert()`, `confirm()`, or `prompt()` popups | Styled inline modals (`#inquiryModal`, `#inquirySuccessModal`, etc.) and toast notifications |
| Duplicate literal `✓` prefixes in toast messages | Pass plain text; toast helpers already render the single checkmark icon |
| Emoji glyphs as UI icons (`📍`, `📧`, `📞`, `❓`, etc.) | Crisp inline SVG icons (`aria-hidden="true"`) |
| `"← Go Back"` pill text buttons on property, inquiry, or legal pages | Minimal borderless icon-only `24px` SVG left-arrow button |
| Sticky mobile bottom `"Call Miriam" / "Inquire Now"` CTA bar on property pages | In-page contact buttons and the floating quick-contact FAB |
| Mandatory scroll-to-bottom Terms modal lock on registration | Direct checkbox toggle with compact inline consent note; Terms/Privacy links open an optional preview modal with **I Agree** enabled immediately |
| PRC License Number / Brokerage inputs on `/pages/admin/profile.html` | 2×2 grid of Full Name, Professional Title / Role, Email Address, and Contact Phone Number |

---

## 3. Established Component & Layout Conventions

### Back Buttons
- **Property detail & 7 showcases:** Borderless `24px` left-arrow SVG button in the status row immediately left of the `Available`/`Sold Out` badge on narrower screens, and positioned in the left margin (`left: -44px`) on wide desktop.
- **Inquiry & Legal pages:** Matching borderless `24px` left-arrow SVG button at top-left.
- **Auth (`login.html`, `register.html`, `forgot-password.html`):** Inline `18px` SVG arrow next to the back link label (`8px` gap).

### Mobile Sign-In, Account Creation, and Password Reset

Each form overlaps the property carousel with two rounded top corners. Its centered handle lowers or raises the form by tap, keyboard activation, or vertical drag. The form scrolls with the page, and horizontal swipes on the photo change slides.

### Typography, Copy & Locale
- **Locale:** Prices in Philippine Pesos (`₱`), PH phone numbers (`+63…` / `09…`), preserve place-name diacritics (`Las Piñas`, `Dasmariñas`).
- **Property Descriptions ("About This Property"):** Justified (`text-align: justify; text-justify: inter-word`), `14px` gap between consecutive paragraphs, `1em` first-line indent.
- **Footer Bio:** Justified on both desktop and mobile.
- **Unified Copyright Line:** `&copy; 2026 UrbanScope &bull; All Rights Reserved` across all public, property, legal, and auth pages (with auth footers on `login.html`, `register.html`, and `forgot-password.html` placing `Home • Privacy Policy • Terms of Service` above the bottom copyright line).
- **Auth Showcase Subtitle:** `"Real Estate Salesperson"` (dark green styling, bright daylight overlay `rgba(12, 28, 17, 0.2)`).

### Navigation, Z-Index & Dropdowns
- Sticky `.navbar` sits at `z-index: 100`. Homepage hero/search/sort dropdowns MUST stay below `100` (`z-index: 75–95`) while clearing featured property cards (`z-index: 20`) so opening any filter never hides the top navigation bar.
- Homepage navbar runs `initHomepageNavScrollSpy()` so the green `.active` highlight tracks `Home`, `Properties`, `About`, `FAQs`, and `Contact` accurately on scroll and hash clicks.
- Labels above custom dropdown triggers (`Property Type`, `Location`, `Sort By`, `Preferred Time / Slot`) must NOT activate the visually hidden native `<select>` OS popup.

### Equal-Height Settings Cards (`>= 1600px`)
- On both `/pages/admin/profile.html` and `/pages/account/profile.html`, desktop side-by-side cards stretch to identical width and height (`grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch;`), with flex-column cards/forms pushing `.card-actions` flush to the bottom. Below the breakpoint, cards stack in single-column flow without excess vertical whitespace.

### Skeleton Loaders
- All 24 active pages load `shared/js/skeleton.js` in `<head>` and inherit `shared/css/skeleton.css` (imported at top of `mobile-shell.css`).
- Replace raw `"Loading..."` text or spinners with layout-matched shimmer placeholders (`.sk`, `.sk-line`, `.sk-pill`, `.sk-rect`), respecting `prefers-reduced-motion: reduce`.

---

## 4. Mobile-Native Standards

Before editing mobile CSS or touch interactions, **read [`.agents/skills/mobile-native/SKILL.md`](../.agents/skills/mobile-native/SKILL.md)**.

Key invariants already enforced across the codebase:
- **Never set `overflow-x: hidden` on `html` or `body`** — use `overflow-x: clip` so mobile touch scrolling never locks (and never put `overscroll-behavior-y: none` on `body`).
- **Prevent iOS focus zoom:** Keep `font-size: 16px` on mobile text `input`, `select`, and `textarea` elements (`<= 768px` / `@media (pointer: coarse)`).
- **Hover gating:** Wrap hover states in `@media (hover: hover) and (pointer: fine)` to eliminate sticky hover states on touchscreens.
- **Viewport & safe areas:** Use `100dvh` (not `100vh`) for full-screen layouts/modals, respect `env(safe-area-inset-*)`, and preserve FAB/back-to-top clearance.
- **Mobile About Me & Footer:** Centered `21px` heading, circular portrait (`144px–176px`), justified indented bio (always expanded, no "Read full bio" toggle), and mobile-only `.about-mobile-avatar` explicitly hidden on desktop (`> 768px`). Mobile footer places copyright on one line after socials and legal links.
- **Mobile Admin Dashboard Order:** KPIs (Completed Inquiries spans full row, `min-height: 85px`) → `Inquiry Status` → always-expanded `Property Viewing Calendar` → `Recent Inquiries` (`Recent Notifications` card hidden on mobile while keeping topbar bell).
- **Property Amenities on Mobile:** Keep exactly 2 clean vertical columns (`16px` gutter; single-list fallback full-width).
