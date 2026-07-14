import { BRAND_ORANGE } from '../themes/accents.js';

/** Zigzag column grid — tuned for 1920×1080 with 10% side safe margin. */
export const ZIG_COL_WIDTH_PX = 600;
export const ZIG_COL_GAP_PX = 128;

export const ZIG_CONN_DRAW_SEC = 0.75;
export const ZIG_BLOCK_ANIM_SEC = 0.55;
export const ZIG_GAP_AFTER_BLOCK_SEC = 0.35;

/** Inline script: anchor connectors to measured block edges (runs in Playwright + browser). */
export function zigzagConnectorScript(): string {
  return `
(function() {
  function rectRelative(el, root) {
    var er = el.getBoundingClientRect();
    var rr = root.getBoundingClientRect();
    return {
      left: er.left - rr.left,
      right: er.right - rr.left,
      top: er.top - rr.top,
      bottom: er.bottom - rr.top,
      cx: (er.left + er.right) / 2 - rr.left,
      cy: (er.top + er.bottom) / 2 - rr.top
    };
  }

  function pathLtr(src, tgt) {
    var x1 = src.cx, y1 = src.bottom;
    var x2 = tgt.left, y2 = tgt.cy;
    return 'M ' + x1 + ' ' + y1 +
      ' V ' + y2 +
      ' H ' + x2 +
      ' M ' + x2 + ' ' + y2 + ' l -9 -4' +
      ' M ' + x2 + ' ' + y2 + ' l -9 4';
  }

  function pathRtl(src, tgt) {
    var x1 = src.cx, y1 = src.bottom;
    var x2 = tgt.right, y2 = tgt.cy;
    return 'M ' + x1 + ' ' + y1 +
      ' V ' + y2 +
      ' H ' + x2 +
      ' M ' + x2 + ' ' + y2 + ' l 9 -4' +
      ' M ' + x2 + ' ' + y2 + ' l 9 4';
  }

  function normalizeColumnWidths() {
    var canvas = document.querySelector('.zig-canvas');
    if (!canvas) return;
    var blocks = Array.prototype.slice.call(canvas.querySelectorAll('.zig-block-wrap'));
    var left = [], right = [];
    blocks.forEach(function(b) {
      var node = b.querySelector('.pipe-node');
      if (!node) return;
      node.style.width = 'auto';
      b.style.width = 'auto';
      (b.classList.contains('zig-left') ? left : right).push({ wrap: b, node: node });
    });
    function apply(items) {
      if (!items.length) return;
      var max = 0;
      items.forEach(function(i) {
        max = Math.max(max, i.node.scrollWidth, i.node.offsetWidth);
      });
      if (max < 1) return;
      var w = Math.ceil(max) + 'px';
      items.forEach(function(i) {
        i.wrap.style.width = w;
        i.node.style.width = '100%';
      });
    }
    apply(left);
    apply(right);
  }

  window.__ecpeLayoutZigConnectors = function() {
    normalizeColumnWidths();
    var canvas = document.querySelector('.zig-canvas');
    if (!canvas) return;
    var svg = canvas.querySelector('.zig-overlay');
    if (!svg) return;
    var delays = [];
    try { delays = JSON.parse(canvas.getAttribute('data-conn-delays') || '[]'); } catch (e) { delays = []; }
    var blocks = Array.prototype.slice.call(canvas.querySelectorAll('.zig-block-wrap'))
      .sort(function(a, b) { return Number(a.getAttribute('data-step')) - Number(b.getAttribute('data-step')); });
    if (blocks.length < 2) { svg.innerHTML = ''; return; }

    var cRect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(cRect.width));
    var h = Math.max(1, Math.round(cRect.height));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.innerHTML = '';

    for (var i = 0; i < blocks.length - 1; i++) {
      var srcNode = blocks[i].querySelector('.pipe-node');
      var tgtNode = blocks[i + 1].querySelector('.pipe-node');
      if (!srcNode || !tgtNode) continue;
      var src = rectRelative(srcNode, canvas);
      var tgt = rectRelative(tgtNode, canvas);
      var ltr = blocks[i].classList.contains('zig-left');
      var d = ltr ? pathLtr(src, tgt) : pathRtl(src, tgt);
      var delay = delays[i] != null ? delays[i] : 0;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'zig-conn-path');
      path.setAttribute('pathLength', '1');
      path.style.opacity = '0';
      path.style.strokeDasharray = '1';
      path.style.strokeDashoffset = '1';
      path.style.animation =
        'zigPathShow 0s linear ' + delay + 's forwards,' +
        'zigDraw ${ZIG_CONN_DRAW_SEC}s ease ' + delay + 's forwards';
      svg.appendChild(path);
    }
  };

  function boot() {
    window.__ecpeLayoutZigConnectors();
    window.addEventListener('resize', window.__ecpeLayoutZigConnectors);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`;
}

export function zigzagConnectorCss(): string {
  return `
  .zig-canvas {
    position: relative;
    box-sizing: border-box;
    padding: 0 10%;
  }
  .zig-stack {
    display: flex; flex-direction: column; gap: 6px; width: 100%;
    margin: 0 auto; position: relative; z-index: 1;
  }
  .zig-row {
    display: grid;
    grid-template-columns: ${ZIG_COL_WIDTH_PX}px ${ZIG_COL_WIDTH_PX}px;
    justify-content: center;
    column-gap: ${ZIG_COL_GAP_PX}px;
    width: 100%;
  }
  .zig-row .zig-block-wrap.zig-left { grid-column: 1; justify-self: start; }
  .zig-row .zig-block-wrap.zig-right { grid-column: 2; justify-self: end; }
  .zig-block-wrap { opacity: 0; box-sizing: border-box; }
  .zig-overlay {
    position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: visible;
  }
  .zig-overlay .zig-conn-path {
    fill: none; stroke: ${BRAND_ORANGE}; stroke-width: 4px;
    stroke-linecap: round; stroke-linejoin: round;
  }
  @keyframes zigFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes zigPathShow { to { opacity: 1; } }
  @keyframes zigDraw { to { stroke-dashoffset: 0; } }
  `;
}
