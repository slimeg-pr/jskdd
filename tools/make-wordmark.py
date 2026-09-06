#!/usr/bin/env python3
"""Set the Monéta wordmark in a real font and emit it as outlines.

The logo ships as vector paths, not as an embedded webfont. That keeps the
page at zero font requests, renders identically everywhere, and — for a font
whose licence covers desktop use but not web embedding — is the route the
licence actually allows.

Shaping goes through HarfBuzz, so OpenType features apply: ligatures,
contextual alternates and kerning all land the way the designer intended.
That matters for a face like Madawaska River, whose distressed texture is
built from custom ligature substitutions rather than baked into the glyphs.

Usage
-----
    python3 tools/make-wordmark.py path/to/MadawaskaRiver.otf
    python3 tools/make-wordmark.py FONT.otf --text "Monéta" --features liga,calt,kern

Writes public/assets/img/moneta-wordmark.svg and public/assets/js/wordmark.js.
"""

import argparse
import os
import sys
import unicodedata

try:
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.recordingPen import RecordingPen
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.misc.transform import Transform
except ImportError:
    sys.exit("Missing dependencies. Run:  pip install fonttools uharfbuzz")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG_OUT = os.path.join(ROOT, "public", "assets", "img", "moneta-wordmark.svg")
JS_OUT = os.path.join(ROOT, "public", "assets", "js", "wordmark.js")

UPEM_TARGET = 1000.0   # the emitted path is normalised to this em size


JS_TEMPLATE = """/* Mon\\u00e9ta \\u2014 the wordmark, as outlines.

   GENERATED FILE. Rebuild with:
       python3 tools/make-wordmark.py <font-file>

   Source font : %(src)s
   Set in      : %(label)s

   The logo ships as vector paths rather than an embedded webfont: the page
   makes no font request, the mark is pixel-identical everywhere, and no font
   binary is redistributed with this repository. */
(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};
  var VB = '%(view)s';
  var D = '%(d)s';

  /**
   * Inline SVG of the Mon\\u00e9ta wordmark.
   * @param {number} [width]        px width; height follows the aspect ratio
   * @param {object} [opts]
   * @param {string} [opts.fill]    solid colour (default: currentColor)
   * @param {string[]} [opts.gradient] stop colours, painted top to bottom
   * @param {string} [opts.cls]     extra class name
   */
  function wordmarkSVG(width, opts) {
    opts = opts || {};
    var defs = '';
    var fill = opts.fill || 'currentColor';

    if (opts.gradient && opts.gradient.length > 1) {
      var id = 'wm-grad-' + (wordmarkSVG._n = (wordmarkSVG._n || 0) + 1);
      var stops = opts.gradient.map(function (c, i) {
        var at = (i / (opts.gradient.length - 1) * 100).toFixed(1);
        return '<stop offset="' + at + '%%" stop-color="' + c + '"/>';
      }).join('');
      defs = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        stops + '</linearGradient></defs>';
      fill = 'url(#' + id + ')';
    }

    return '<svg class="moneta-wordmark' + (opts.cls ? ' ' + opts.cls : '') +
      '" viewBox="' + VB + '"' + (width ? ' width="' + width + '"' : '') +
      ' role="img" aria-label="Mon\\u00e9ta"><title>Mon\\u00e9ta</title>' +
      defs + '<path fill="' + fill + '" d="' + D + '"/></svg>';
  }

  M.wordmarkSVG = wordmarkSVG;
  M.WORDMARK_PATH = D;
  M.WORDMARK_VIEWBOX = VB;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
"""

def shape(font_path, text, features, upem):
    """Run the string through HarfBuzz; return [(glyph_id, x_off, y_off, x_adv)]."""
    with open(font_path, "rb") as fh:
        blob = hb.Blob(fh.read())
    face = hb.Face(blob)
    hb_font = hb.Font(face)
    hb_font.scale = (upem, upem)

    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {f: True for f in features})

    out = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        out.append((info.codepoint, pos.x_offset, pos.y_offset, pos.x_advance))
    return out


def outline(font_path, shaped, scale):
    """Turn shaped glyphs into one SVG path string, plus its tight bounds."""
    tt = TTFont(font_path)
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()

    combined = RecordingPen()
    pen_bounds = BoundsPen(glyph_set)
    x = 0.0
    drew = 0

    for gid, x_off, y_off, x_adv in shaped:
        name = order[gid] if gid < len(order) else None
        if name is None:
            continue
        # Flip Y: font space is y-up, SVG is y-down.
        t = Transform(scale, 0, 0, -scale, (x + x_off) * scale, (y_off) * -scale)
        rec = RecordingPen()
        glyph_set[name].draw(rec)
        if rec.value:
            drew += 1
            rec.replay(TransformPen(combined, t))
            rec.replay(TransformPen(pen_bounds, t))
        x += x_adv

    if not drew:
        sys.exit("No glyph outlines were produced — is this a colour or bitmap font?")

    svg_pen = SVGPathPen(glyph_set, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    combined.replay(svg_pen)
    return svg_pen.getCommands(), pen_bounds.bounds, tt


def font_label(tt):
    """Best-effort 'Family Style' name for the provenance comment."""
    def nm(nid):
        rec = tt["name"].getDebugName(nid)
        return rec.strip() if rec else ""
    fam = nm(16) or nm(1) or "Unknown"
    sub = nm(17) or nm(2) or ""
    return (fam + " " + sub).strip()


def main():
    ap = argparse.ArgumentParser(description="Set the Monéta wordmark as outlines.")
    ap.add_argument("font", help="path to a .otf / .ttf file")
    ap.add_argument("--text", default="Monéta")
    ap.add_argument("--features", default="liga,clig,calt,kern",
                    help="comma-separated OpenType features to enable")
    ap.add_argument("--pad", type=float, default=0.0,
                    help="padding around the tight bounds, in em/1000 units")
    ap.add_argument("--letter-spacing", type=float, default=0.0,
                    help="extra tracking in em/1000 units")
    args = ap.parse_args()

    if not os.path.isfile(args.font):
        sys.exit("No such file: " + args.font)

    text = unicodedata.normalize("NFC", args.text)
    features = [f.strip() for f in args.features.split(",") if f.strip()]

    with open(args.font, "rb") as fh:
        face = hb.Face(hb.Blob(fh.read()))
    upem = face.upem or 1000
    scale = UPEM_TARGET / upem

    shaped = shape(args.font, text, features, upem)
    if args.letter_spacing:
        track = args.letter_spacing / scale
        shaped = [(g, xo, yo, xa + track) for (g, xo, yo, xa) in shaped]

    d, bounds, tt = outline(args.font, shaped, scale)
    x0, y0, x1, y1 = bounds
    x0 -= args.pad; y0 -= args.pad; x1 += args.pad; y1 += args.pad
    w, h = x1 - x0, y1 - y0

    # Re-origin the path at 0,0 by shifting the viewBox rather than the path,
    # which keeps the numbers short and the geometry untouched.
    view = f"{x0:.2f} {y0:.2f} {w:.2f} {h:.2f}"
    label = font_label(tt)

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" role="img" aria-label="%s">\n'
        '  <title>%s</title>\n'
        '  <path fill="currentColor" d="%s"/>\n'
        '</svg>\n' % (view, text, text, d)
    )
    os.makedirs(os.path.dirname(SVG_OUT), exist_ok=True)
    with open(SVG_OUT, "w", encoding="utf-8") as fh:
        fh.write(svg)

    js = JS_TEMPLATE % {
        "src": os.path.basename(args.font),
        "label": label,
        "view": view,
        "d": d.replace("\\", "\\\\").replace("'", "\\'"),
    }
    with open(JS_OUT, "w", encoding="utf-8") as fh:
        fh.write(js)

    print("font      : %s  (%s, upem %d)" % (os.path.basename(args.font), label, upem))
    print("features  : %s" % ", ".join(features))
    print("glyphs    : %d shaped" % len(shaped))
    print("viewBox   : %s" % view)
    print("path size : %d chars" % len(d))
    print("wrote     : %s" % os.path.relpath(SVG_OUT, ROOT))
    print("wrote     : %s" % os.path.relpath(JS_OUT, ROOT))


if __name__ == "__main__":
    main()
