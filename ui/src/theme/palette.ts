/**
 * The colours whose contrast is asserted.
 *
 * They live here, apart from the Mantine theme, so the check in
 * `contrast.test.ts` reads the same values the stylesheet applies rather than a
 * copy that can drift. Changing one of these changes what the test measures.
 */

/** Cards, modals, tables: the surface most text sits on in light mode. */
export const SURFACE_LIGHT = '#ffffff';

/**
 * The application background in light mode.
 *
 * The important one, and the one that was missed. It is slightly grey, so a
 * foreground chosen against pure white loses roughly 0.2 of its ratio here —
 * enough to take Mantine's default dimmed grey from "nearly passing" to
 * failing, on the surface most of the page actually uses.
 */
export const SURFACE_PAGE = '#f7f7f8';

/** Cards, modals and tables in dark mode (the theme's dark-7). */
export const SURFACE_DARK = '#17171a';

/**
 * Secondary text in light mode.
 *
 * Mantine's default is `#868e96`, which measures 3.15:1 on the page background
 * where AA asks for 4.5. This is dark enough to pass on both light surfaces
 * (5.78:1 on the page, 6.09:1 on a card) and still clearly quieter than body
 * text.
 */
export const DIMMED_LIGHT = '#5c636a';

/** Secondary text in dark mode. Mantine's default already passes, at 7.16:1. */
export const DIMMED_DARK = '#a6a7ab';

/**
 * The tint under table headers, inset panels and form previews: one step off
 * the card it sits in. A colour per scheme, read through the
 * `--app-surface-subtle` variable, so nothing paints a light grey that stays
 * light in dark mode. Mantine's gray-0 and dark-6.
 */
export const SURFACE_SUBTLE_LIGHT = '#f8f9fa';
export const SURFACE_SUBTLE_DARK = '#1e1e23';

/**
 * The frame around the page: the sidebar and the top bar share it, with no
 * line between them, and the page sits on a rounded panel inset from it. Tone
 * does the separating that borders used to.
 */
export const FRAME_LIGHT = '#f1f1f3';
export const FRAME_DARK = '#0b0b0d';

/** The page panel the content sits on. Cards are SURFACE_LIGHT / SURFACE_DARK on it. */
export const PAGE_LIGHT = '#f7f7f8';
export const PAGE_DARK = '#131316';

/**
 * A neutral dark scale in place of Mantine's blue-tinted one, so dark mode
 * reads as grey rather than navy. Index 0 is body text, 7 is a card, 8 the
 * page and 9 the frame.
 */
export const DARK_SCALE = [
  '#ececef', '#b4b4bc', '#8b8b94', '#6b6b74', '#3a3a42',
  '#2a2a30', '#202025', '#17171a', '#131316', '#0b0b0d',
] as const;
