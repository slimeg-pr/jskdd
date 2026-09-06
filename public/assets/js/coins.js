/* Monéta — asset registry.
   Every logo is inline SVG (viewBox 0 0 32 32) so the portal renders
   offline with zero network requests. Iconic marks are drawn as paths;
   the rest use their brand glyph on the brand colour. */

(function (global) {
  'use strict';

  // circle-backed glyph mark (used where the brand IS a letterform)
  function glyph(bg, ch, fg, size) {
    return '<circle cx="16" cy="16" r="16" fill="' + bg + '"/>' +
      '<text x="16" y="16" text-anchor="middle" dominant-baseline="central" ' +
      'font-family="Sora, Inter, sans-serif" font-weight="800" font-size="' +
      (size || 15) + '" fill="' + (fg || '#fff') + '">' + ch + '</text>';
  }

  function ring(bg) { return '<circle cx="16" cy="16" r="16" fill="' + bg + '"/>'; }

  var MARK = {
    BTC: ring('#F7931A') +
      '<path fill="#fff" d="M22.7 14.3c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6-1.3-.3.7-2.7-1.7-.4-.7 2.7-1-.3-2.3-.6-.4 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1v.2l-1.1 4.4c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5 1.2.3-.7 2.8 1.7.4.7-2.7 1.3.3-.7 2.7 1.7.4.7-2.7c2.9.5 5 .3 5.9-2.3.7-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.5c-.5 2.1-4 1-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.6c-.5 1.9-3.4.9-4.4.7l.8-3.4c1 .3 4.1.7 3.6 2.7z"/>',

    ETH: ring('#627EEA') +
      '<g fill="#fff"><path fill-opacity=".62" d="M16 3.5v9.2l7.8 3.5z"/>' +
      '<path d="M16 3.5 8.2 16.2 16 12.7z"/>' +
      '<path fill-opacity=".62" d="M16 22.2v6.3l7.8-10.8z"/>' +
      '<path d="M16 28.5v-6.3L8.2 17.7z"/>' +
      '<path fill-opacity=".2" d="m16 20.7 7.8-4.5-7.8-3.5z"/>' +
      '<path fill-opacity=".62" d="m8.2 16.2 7.8 4.5v-8z"/></g>',

    SOL: ring('#111119') +
      '<defs><linearGradient id="solg" x1="4" y1="26" x2="28" y2="6" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#00FFA3"/><stop offset="1" stop-color="#DC1FFF"/></linearGradient></defs>' +
      '<g fill="url(#solg)"><path d="M9.4 20.9a.7.7 0 0 1 .5-.2h15.4c.3 0 .5.4.3.6l-3 3a.7.7 0 0 1-.5.2H6.7c-.3 0-.5-.4-.3-.6z"/>' +
      '<path d="M9.4 8.1a.7.7 0 0 1 .5-.2h15.4c.3 0 .5.4.3.6l-3 3a.7.7 0 0 1-.5.2H6.7c-.3 0-.5-.4-.3-.6z"/>' +
      '<path d="M22.6 14.5a.7.7 0 0 0-.5-.2H6.7c-.3 0-.5.4-.3.6l3 3a.7.7 0 0 0 .5.2h15.4c.3 0 .5-.4.3-.6z"/></g>',

    XRP: ring('#23292F') +
      '<g stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
      '<path d="M7.5 7.5 13 13a4.3 4.3 0 0 0 6 0l5.5-5.5"/>' +
      '<path d="M7.5 24.5 13 19a4.3 4.3 0 0 1 6 0l5.5 5.5"/></g>',

    BNB: ring('#F3BA2F') +
      '<g fill="#fff">' +
      '<path d="M16 5.199999999999999L19.4 8.6L16 12.0L12.6 8.6Z"/>' +
      '<path d="M8.6 12.6L12.0 16L8.6 19.4L5.199999999999999 16Z"/>' +
      '<path d="M23.4 12.6L26.799999999999997 16L23.4 19.4L20.0 16Z"/>' +
      '<path d="M16 20.0L19.4 23.4L16 26.799999999999997L12.6 23.4Z"/>' +
      '<path d="M16 12.6L19.4 16L16 19.4L12.6 16Z"/></g>',
    ADA: ring('#0033AD') +
      '<g fill="#fff"><circle cx="16" cy="16" r="2.6"/>' +
      '<circle cx="16" cy="7.6" r="1.5"/><circle cx="16" cy="24.4" r="1.5"/>' +
      '<circle cx="8.7" cy="11.8" r="1.5"/><circle cx="23.3" cy="20.2" r="1.5"/>' +
      '<circle cx="8.7" cy="20.2" r="1.5"/><circle cx="23.3" cy="11.8" r="1.5"/>' +
      '<circle cx="16" cy="12.1" r="1.05"/><circle cx="16" cy="19.9" r="1.05"/>' +
      '<circle cx="12.6" cy="14.1" r="1.05"/><circle cx="19.4" cy="17.9" r="1.05"/>' +
      '<circle cx="12.6" cy="17.9" r="1.05"/><circle cx="19.4" cy="14.1" r="1.05"/>' +
      '<circle cx="5.2" cy="16" r="1.1"/><circle cx="26.8" cy="16" r="1.1"/>' +
      '<circle cx="10.4" cy="6.4" r="1"/><circle cx="21.6" cy="25.6" r="1"/>' +
      '<circle cx="21.6" cy="6.4" r="1"/><circle cx="10.4" cy="25.6" r="1"/></g>',

    DOGE: ring('#C2A633') +
      '<path fill="#fff" d="M11.4 8.6h5.3c4.5 0 7.4 2.9 7.4 7.4s-2.9 7.4-7.4 7.4h-5.3v-5.6H9.1v-3.6h2.3zm3.6 3.3v3.1h2.6v3.6H15v3.1h1.6c2.5 0 4-1.6 4-4.7s-1.5-4.7-4-4.7z"/>',

    LTC: ring('#345D9D') +
      '<path fill="#fff" d="m13.7 7.6h4.4l-2.5 9.1 3.9-1.2-.8 3-3.9 1.2-1.1 3.9h9.1l-1 3.3H8.3l1.9-6.9-2.6.8.8-3 2.6-.8z"/>',

    DOT: ring('#E6007A') +
      '<g fill="#fff"><ellipse cx="16" cy="8.2" rx="4.1" ry="2.4"/>' +
      '<ellipse cx="16" cy="23.8" rx="4.1" ry="2.4"/>' +
      '<ellipse cx="9.4" cy="12" rx="4.1" ry="2.4" transform="rotate(-60 9.4 12)"/>' +
      '<ellipse cx="22.6" cy="20" rx="4.1" ry="2.4" transform="rotate(-60 22.6 20)"/>' +
      '<ellipse cx="9.4" cy="20" rx="4.1" ry="2.4" transform="rotate(60 9.4 20)"/>' +
      '<ellipse cx="22.6" cy="12" rx="4.1" ry="2.4" transform="rotate(60 22.6 12)"/></g>',

    LINK: ring('#2A5ADA') +
      '<path fill="#fff" d="m16 5.6 2.6 1.5 6.6 3.8v11.2L16 27.4l-9.2-5.3V10.9zm0 4.3-5.4 3.1v6.2l5.4 3.1 5.4-3.1v-6.2z"/>',

    AVAX: ring('#E84142') +
      '<path fill="#fff" d="M20.6 20.8c.6-1 1.5-1 2.1 0l3.3 5.9c.6 1 .2 1.9-1 1.9h-6.7c-1.1 0-1.6-.9-1-1.9zM14.5 9.9c.6-1 1.4-1 2 0l.8 1.5c.5.9.5 1.9 0 2.8l-5 8.7c-.6.9-1.5 1.5-2.6 1.5H5.9c-1.2 0-1.6-.9-1-1.9z"/>',

    TRX: ring('#EF0027') +
      '<path fill="#fff" d="M24.7 10.3 8.1 7.2c-.4-.1-.7.3-.5.6l8.2 17.6c.2.4.7.4.9 0l8.4-14.4c.2-.3 0-.6-.4-.7zm-2.3 1.9-4.6 8-1.2-8.9zm-7.6-1.3 1.2 9.2-5.6-12z"/>',

    XLM: ring('#0F0F0F') +
      '<g fill="none" stroke="#fff" stroke-width="1.5">' +
      '<circle cx="16" cy="16" r="10.6"/></g>' +
      '<path fill="#fff" d="M25.6 8.9 6.6 18.6l-.7-1.5 19-9.7zM6.4 23.1l19-9.7.7 1.5-19 9.7z"/>' +
      '<path fill="#fff" d="M11.9 7.4a10.6 10.6 0 0 1 12.4 3.1l-2 1a8.4 8.4 0 0 0-8.3-2.6zM20.1 24.6a10.6 10.6 0 0 1-12.4-3.1l2-1a8.4 8.4 0 0 0 8.3 2.6z" opacity=".85"/>',
    ATOM: ring('#2E3148') +
      '<g fill="none" stroke="#fff" stroke-width="1.2">' +
      '<ellipse cx="16" cy="16" rx="4.4" ry="10.6"/>' +
      '<ellipse cx="16" cy="16" rx="4.4" ry="10.6" transform="rotate(60 16 16)"/>' +
      '<ellipse cx="16" cy="16" rx="4.4" ry="10.6" transform="rotate(120 16 16)"/></g>' +
      '<circle cx="16" cy="16" r="2.2" fill="#fff"/>',

    XMR: ring('#FF6600') +
      '<path fill="#fff" d="M8 22.6V9.4l8 8.4 8-8.4v13.2h-3.6v-6.4L16 21.3l-4.4-5.1v6.4z"/>',

    UNI: ring('#FF007A') + glyph('rgba(0,0,0,0)', 'U', '#fff', 16).replace('<circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0)"/>', ''),
    TON: ring('#0098EA') +
      '<path fill="#fff" d="M8 11h16l-8 14zm2.6 1.8 4.5 8V12.8zm6.3 0v8l4.5-8z"/>',
    SUI: ring('#4DA2FF') +
      '<path fill="#fff" d="M16 5c4.4 6.2 7.6 9.7 7.6 13.6A7.6 7.6 0 0 1 8.4 18.6C8.4 14.7 11.6 11.2 16 5zm0 4.1c-3 4.4-5.1 7-5.1 9.5a5.1 5.1 0 0 0 10.2 0c0-2.5-2.1-5.1-5.1-9.5z"/>',
    APT: ring('#0D0D0D') +
      '<path fill="#fff" d="M23.4 12.6h-3.1l-1.2-1.4a1 1 0 0 0-1.5 0l-1.4 1.4H6.5a10.2 10.2 0 0 1 1.3-2.4h4.4l1.2-1.4a1 1 0 0 1 1.5 0l1.4 1.4h9a10 10 0 0 1 1.3 2.4zM5.3 16.5c0-.4 0-.8.1-1.2h9.8l1.2-1.4a1 1 0 0 1 1.5 0l1.4 1.4h7.3c.1.4.1.8.1 1.2s0 .8-.1 1.2h-9.8l-1.2 1.4a1 1 0 0 1-1.5 0l-1.4-1.4H5.4a9 9 0 0 1-.1-1.2zm2 5.4h4.4l1.2 1.4a1 1 0 0 0 1.5 0l1.4-1.4h9a10.2 10.2 0 0 1-16.3 2.4z"/>',
    NEAR: ring('#00EC97') +
      '<path fill="#000" d="M23 6.6a2.6 2.6 0 0 0-2.2 1.2l-3.6 5.3c-.2.4.3.8.6.5l3.5-3a.3.3 0 0 1 .5.2v10.2a.3.3 0 0 1-.5.2L10.5 7.5A2.6 2.6 0 0 0 8.5 6.6H8a2.6 2.6 0 0 0-2.6 2.6v13.6A2.6 2.6 0 0 0 8 25.4a2.6 2.6 0 0 0 2.2-1.2l3.6-5.3c.2-.4-.3-.8-.6-.5l-3.5 3a.3.3 0 0 1-.5-.2V11a.3.3 0 0 1 .5-.2l10.8 13.7a2.6 2.6 0 0 0 2 .9h.5a2.6 2.6 0 0 0 2.6-2.6V9.2A2.6 2.6 0 0 0 23 6.6z"/>',
    ICP: ring('#1B1B2E') +
      '<path fill="#fff" d="M21.4 10.2c-1.9 0-3.9 1-6 3-1-.9-1.9-1.7-2.6-2.2-1-.6-1.9-.8-2.8-.8A5.7 5.7 0 0 0 4.4 16a5.7 5.7 0 0 0 5.6 5.8c1.9 0 3.9-1 6-3 1 .9 1.9 1.7 2.6 2.2 1 .6 1.9.8 2.8.8A5.7 5.7 0 0 0 27 16a5.7 5.7 0 0 0-5.6-5.8zm0 2.7A3 3 0 0 1 24.3 16a3 3 0 0 1-2.9 3.1c-.4 0-.9-.1-1.4-.4-.6-.4-1.4-1-2.3-1.9l1-1c1.8-1.8 3-1.9 3.7-1.9zM10 19.1A3 3 0 0 1 7.1 16 3 3 0 0 1 10 12.9c.4 0 .9.1 1.4.4.6.4 1.4 1 2.3 1.9l-1 1c-1.8 1.8-3 1.9-3.7 1.9z"/>',
    HBAR: ring('#000000') +
      '<path fill="#fff" d="M10 8h2.6v5.6h6.8V8H22v16h-2.6v-6.2h-6.8V24H10z"/>',
    FIL: ring('#0090FF') +
      '<path fill="#fff" d="M17.7 13.9 17 17l4.4.6-.3 1.6-4.4-.6-1 4.6c-.4 1.7-1.2 3-2.6 3.9a5.2 5.2 0 0 1-4.7.4l.7-1.6c1 .4 2 .3 2.9-.3.8-.6 1.3-1.4 1.6-2.6l1-4.7-4.2-.6.2-1.6 4.3.6.7-3.1-4.4-.6.2-1.7 4.6.6.9-3.9c.4-1.7 1.3-3 2.7-3.8a5.2 5.2 0 0 1 4.7-.3l-.7 1.6c-1-.4-2-.3-2.9.3-.8.6-1.4 1.5-1.6 2.6l-.8 3.7 5 .7-.3 1.6z"/>',
    ETC: ring('#3AB83A') +
      '<g fill="#fff"><path fill-opacity=".6" d="M16 3.5v9.2l7.8 3.5z"/><path d="M16 3.5 8.2 16.2 16 12.7z"/>' +
      '<path fill-opacity=".6" d="M16 22.2v6.3l7.8-10.8z"/><path d="M16 28.5v-6.3L8.2 17.7z"/>' +
      '<path fill-opacity=".2" d="m16 20.7 7.8-4.5-7.8-3.5z"/><path fill-opacity=".6" d="m8.2 16.2 7.8 4.5v-8z"/></g>',
    BCH: ring('#8DC351') +
      '<path fill="#fff" d="M21.8 13.6c.3-1.9-1.1-3-3.1-3.6l.6-2.5-1.6-.4-.6 2.4-1.2-.3.6-2.4-1.5-.4-.7 2.5-3.1-.8-.4 1.7s1.1.3 1.1.3c.6.2.7.6.7.9l-1.7 6.9c-.1.2-.3.5-.7.4 0 0-1.1-.3-1.1-.3l-.8 1.8 3.1.8-.6 2.5 1.5.4.6-2.5 1.3.3-.6 2.5 1.6.4.6-2.5c2.7.5 4.7.3 5.6-2.2.7-2 0-3.1-1.4-3.8 1-.3 1.8-1 2-2.4zm-3.5 5.2c-.5 2-3.8.9-4.9.7l.9-3.4c1 .2 4.5.7 4 2.7zm.5-5.3c-.5 1.8-3.2.9-4.1.6l.8-3.1c.9.2 3.8.6 3.3 2.5z"/>',
    XTZ: ring('#2C7DF7') + glyph('rgba(0,0,0,0)', 'ꜩ', '#fff', 17).replace('<circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0)"/>', ''),
    ALGO: ring('#000000') +
      '<path fill="#fff" d="M6 24 14.3 9.6h2.5l.9 3.1L11.4 24H8.6l5.4-9.4-.6-2.1L8.6 24zm10.9 0-1.6-5.6 2.3-4 2.7 9.6h-2.6zm2.9-11.9-.7-2.5h2.5l.7 2.5z"/>',
    VET: ring('#15BDFF') +
      '<path fill="#fff" d="M6 7h6.5l3.5 7.3L19.5 7H26L16 25z"/>',
    AAVE: ring('#B6509E') +
      '<path fill="#fff" d="M22.7 22.4 17.3 9.6c-.3-.7-.8-1-1.4-1s-1.1.3-1.4 1l-2.4 5.7h-1.8a1 1 0 0 0 0 2h1l-2.1 5.1a1 1 0 0 0 .1.9 1 1 0 0 0 .8.4 1 1 0 0 0 .9-.6l2.4-5.8h2.3a1 1 0 0 0 0-2h-1.5l1.7-4.2 5.1 12a1 1 0 0 0 .9.6 1 1 0 0 0 .8-.4 1 1 0 0 0 0-.9z"/>',
    SHIB: ring('#FFA409') +
      '<path fill="#fff" d="M9.6 7.4 13 12.2a9.4 9.4 0 0 1 6 0l3.4-4.8 1.4 6.1a8.6 8.6 0 0 1 1.4 4.7c0 4.4-4.1 7.6-9.2 7.6s-9.2-3.2-9.2-7.6a8.6 8.6 0 0 1 1.4-4.7z"/>' +
      '<circle cx="12.7" cy="17.4" r="1.5" fill="#3b2200"/><circle cx="19.3" cy="17.4" r="1.5" fill="#3b2200"/>' +
      '<path d="M16 19.6a1.5 1.5 0 0 1 1.5 1.4c0 .8-.7 1.3-1.5 1.3s-1.5-.5-1.5-1.3a1.5 1.5 0 0 1 1.5-1.4z" fill="#3b2200"/>',
    PEPE: ring('#3D8130') +
      '<path fill="#7ec850" d="M16 8.6c5 0 8.6 3.3 8.6 8.2 0 4.4-3.6 7.6-8.6 7.6s-8.6-3.2-8.6-7.6c0-4.9 3.6-8.2 8.6-8.2z"/>' +
      '<circle cx="12.1" cy="12.4" r="3.5" fill="#fff"/><circle cx="19.9" cy="12.4" r="3.5" fill="#fff"/>' +
      '<circle cx="12.4" cy="12.8" r="1.5" fill="#111"/><circle cx="19.6" cy="12.8" r="1.5" fill="#111"/>' +
      '<path fill="#111" d="M10.4 19.4h11.2a.7.7 0 0 1 .6 1.1c-1.2 1.7-3.4 2.7-6.2 2.7s-5-1-6.2-2.7a.7.7 0 0 1 .6-1.1z"/>',
    ARB: ring('#213147') +
      '<path fill="#12AAFF" d="m16 5 9.5 5.5v11L16 27l-9.5-5.5v-11z"/>' +
      '<path fill="#fff" d="m14.4 12.5 2.6 7.1-2.2 1.3-3.5-9.6zm3.9-2.2 5.2 13.1-2.3 1.3-5.2-13.1z" opacity=".95"/>',
    OP: ring('#FF0420') +
      '<text x="16" y="16.6" text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif" font-weight="800" font-size="12.5" fill="#fff">OP</text>',
    INJ: ring('#00A3FF') +
      '<path fill="#fff" d="M22.9 11.6a4.5 4.5 0 0 0-4.6-1.3c.5-1.7-.2-3.6-1.8-4.5a4.5 4.5 0 0 0-6.1 1.7c-.9 1.6-.6 3.5.6 4.8a4.5 4.5 0 0 0-4 4.2 10 10 0 0 0 19.4 2.8 4.5 4.5 0 0 0-3.5-7.7zm-3.1 9.6a4.5 4.5 0 0 1-7.6 0c-1-1.6-.7-3.4-.2-4.8.5-1.4 1.2-2.5 1.9-3.5a5 5 0 0 0 4.2 0c.7 1 1.4 2.1 1.9 3.5.5 1.4.8 3.2-.2 4.8z"/>',
    RNDR: ring('#FF3B3B') +
      '<path fill="#fff" d="M10 7h7.6c3.3 0 5.4 2 5.4 5 0 2.2-1.1 3.8-3 4.6l3.5 8.4h-3.6l-3.1-7.7h-3.2V25H10zm3.6 3v4.5h3.6c1.4 0 2.3-.9 2.3-2.3s-.9-2.2-2.3-2.2z"/>',
    IMX: ring('#0B0D14') +
      '<path fill="#fff" d="M16 4a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 3.1a8.9 8.9 0 0 1 7.4 4l-2.6 1.5a5.9 5.9 0 0 0-9.6 0L8.6 11a8.9 8.9 0 0 1 7.4-3.9zm-8.9 8.9c0-1 .2-2 .5-2.9l2.6 1.5a5.9 5.9 0 0 0 4.8 8.3v3a8.9 8.9 0 0 1-7.9-9.9zm10.4 9.9v-3a5.9 5.9 0 0 0 4.8-8.3l2.6-1.5a8.9 8.9 0 0 1-7.4 12.8z"/>',
    STX: ring('#5546FF') +
      '<path fill="#fff" d="M23 19.4H9v2.2h14zm0-8.8H9v2.2h14zM19.6 25l-3.6-5.6L12.4 25H9.6l4.8-7.4h3.2L22.4 25zM12.4 7l3.6 5.6L19.6 7h2.8l-4.8 7.4h-3.2L9.6 7z"/>',
    POL: ring('#8247E5') +
      '<path fill="#fff" d="m16 5.6 9 5.2v10.4l-9 5.2-9-5.2V10.8zm0 3.5-6 3.4v6.9l6 3.4 6-3.4v-6.9zm0 3.4 3 1.7v3.5l-3 1.8-3-1.8v-3.5z"/>',
    CRO: ring('#0B1C3C') +
      '<path fill="#fff" d="m16 4 10.4 6v12L16 28 5.6 22V10zm0 2.9-7.9 4.6v9.1l7.9 4.6 7.9-4.6v-9.1zm0 3.1 5.2 3v6l-5.2 3-5.2-3v-6zm0 2.4-3.1 1.8v3.6l3.1 1.8 3.1-1.8v-3.6z"/>',
    MNT: ring('#000000') +
      '<path fill="#fff" d="M16 4a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.4 17.6h-2.9v-6.4l-2.5 4.2-2.5-4.2v6.4h-2.9V10.4h2.7l2.7 4.7 2.7-4.7h2.7z"/>',
    KAS: ring('#70C7BA') +
      '<path fill="#fff" d="M12.6 7h3v7.3L21.9 7h3.7l-6.6 7.7 6.9 10.3h-3.6l-5.4-8.1-1.3 1.5V25h-3z"/>'
  };

  // symbol, name, brand colour, USD seed price, annualised-ish volatility knob,
  // circulating supply (for market cap), category tags
  var LIST = [
    ['BTC','Bitcoin','#F7931A',96420.18,0.9,19.82e6,['Layer 1','Store of value']],
    ['ETH','Ethereum','#627EEA',3418.76,1.15,120.4e6,['Layer 1','Smart contracts']],
    ['SOL','Solana','#14F195',214.63,1.9,478.2e6,['Layer 1','High throughput']],
    ['BNB','BNB','#F3BA2F',691.42,1.1,145.9e6,['Layer 1','Exchange']],
    ['XRP','XRP','#23292F',2.3417,1.7,57.6e9,['Payments']],
    ['ADA','Cardano','#0033AD',0.9182,1.75,35.9e9,['Layer 1']],
    ['DOGE','Dogecoin','#C2A633',0.3614,2.4,146.8e9,['Meme','Payments']],
    ['AVAX','Avalanche','#E84142',41.28,1.95,412.6e6,['Layer 1']],
    ['DOT','Polkadot','#E6007A',7.412,1.8,1.52e9,['Layer 0','Interop']],
    ['LINK','Chainlink','#2A5ADA',24.63,1.85,626.8e6,['Oracle','DeFi']],
    ['POL','Polygon','#8247E5',0.5214,2.0,10.1e9,['Layer 2','Scaling']],
    ['LTC','Litecoin','#345D9D',118.42,1.2,75.4e6,['Payments']],
    ['TRX','TRON','#EF0027',0.2614,1.5,86.3e9,['Layer 1']],
    ['XLM','Stellar','#0F0F0F',0.4218,1.7,30.2e9,['Payments']],
    ['ATOM','Cosmos','#2E3148',6.842,1.9,391.4e6,['Interop']],
    ['XMR','Monero','#FF6600',198.34,1.3,18.4e6,['Privacy']],
    ['UNI','Uniswap','#FF007A',13.418,2.0,600.5e6,['DeFi','DEX']],
    ['TON','Toncoin','#0098EA',5.612,1.9,2.54e9,['Layer 1']],
    ['SUI','Sui','#4DA2FF',4.318,2.3,2.9e9,['Layer 1']],
    ['APT','Aptos','#0D0D0D',11.24,2.2,590.2e6,['Layer 1']],
    ['NEAR','NEAR','#00EC97',6.118,2.1,1.19e9,['Layer 1']],
    ['ICP','Internet Computer','#1B1B2E',9.842,2.2,478.9e6,['Compute']],
    ['HBAR','Hedera','#000000',0.2814,1.9,38.4e9,['Enterprise']],
    ['FIL','Filecoin','#0090FF',5.412,2.1,620.4e6,['Storage']],
    ['ETC','Ethereum Classic','#3AB83A',29.41,1.7,148.9e6,['Layer 1']],
    ['BCH','Bitcoin Cash','#8DC351',512.18,1.4,19.8e6,['Payments']],
    ['XTZ','Tezos','#2C7DF7',1.1412,1.9,1.02e9,['Layer 1']],
    ['ALGO','Algorand','#000000',0.3612,2.0,8.4e9,['Layer 1']],
    ['VET','VeChain','#15BDFF',0.0482,2.1,80.9e9,['Supply chain']],
    ['AAVE','Aave','#B6509E',342.61,2.1,15.1e6,['DeFi','Lending']],
    ['INJ','Injective','#00A3FF',24.81,2.4,98.2e6,['DeFi','Layer 1']],
    ['RNDR','Render','#FF3B3B',7.912,2.4,518.4e6,['AI','Compute']],
    ['IMX','Immutable','#0B0D14',1.4218,2.3,1.64e9,['Gaming','Layer 2']],
    ['STX','Stacks','#5546FF',1.9814,2.2,1.51e9,['Bitcoin L2']],
    ['ARB','Arbitrum','#12AAFF',0.8614,2.2,4.28e9,['Layer 2']],
    ['OP','Optimism','#FF0420',1.9218,2.2,1.71e9,['Layer 2']],
    ['CRO','Cronos','#0B1C3C',0.1418,2.0,26.4e9,['Exchange']],
    ['MNT','Mantle','#000000',1.0412,2.2,3.28e9,['Layer 2']],
    ['KAS','Kaspa','#70C7BA',0.1214,2.5,25.1e9,['Layer 1','PoW']],
    ['SHIB','Shiba Inu','#FFA409',0.0000241,2.9,589.3e12,['Meme']],
    ['PEPE','Pepe','#3D8130',0.0000189,3.4,420.6e12,['Meme']]
  ];

  var COINS = LIST.map(function (r, i) {
    var sym = r[0];
    return {
      rank: i + 1,
      symbol: sym,
      name: r[1],
      color: r[2],
      seed: r[3],
      vol: r[4],
      supply: r[5],
      tags: r[6],
      mark: MARK[sym] || glyph(r[2], sym.slice(0, 1), '#fff', 15)
    };
  });

  var BY_SYMBOL = {};
  COINS.forEach(function (c) { BY_SYMBOL[c.symbol] = c; });

  /** Renders a coin logo as an <svg> string at the given pixel size. */
  function logo(symbol, size) {
    var c = BY_SYMBOL[symbol];
    if (!c) return '';
    var s = size || 32;
    return '<svg class="coin-logo" viewBox="0 0 32 32" width="' + s + '" height="' + s +
      '" aria-label="' + c.name + '" role="img">' + c.mark + '</svg>';
  }

  var M = global.Moneta = global.Moneta || {};
  M.COINS = COINS;
  M.coin = function (s) { return BY_SYMBOL[s]; };
  M.logo = logo;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
