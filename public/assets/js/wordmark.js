/* Monéta — the wordmark, as outlines.

   PLACEHOLDER. No font has been set yet, so `Moneta.wordmarkSVG` is absent
   and the pages fall back to rendering "Monéta" as live gradient text in the
   display stack.

   To set the logo in a real typeface, drop the font file somewhere local and
   run:

       pip install fonttools uharfbuzz
       python3 tools/make-wordmark.py path/to/MadawaskaRiver.otf

   That overwrites this file with the outlined path and writes
   public/assets/img/moneta-wordmark.svg alongside it. Both pages pick it up
   automatically — no other edit needed.

   The logo is shipped as outlines rather than an embedded webfont on purpose:
   the page makes no font request, the mark is identical in every browser, and
   no font binary is redistributed with this repository. Madawaska River's
   dafont licence covers desktop use — making logos and graphics — but points
   you at typodermicfonts.com for a separate licence to embed the font itself
   on the web. Outlines stay on the right side of that line; a bundled .otf
   with an @font-face rule would not. */
(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};
  M.wordmarkSVG = null;   // set by tools/make-wordmark.py
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
