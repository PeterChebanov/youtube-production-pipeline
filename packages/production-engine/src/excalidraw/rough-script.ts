/** Client-side rough.js drawing for sketch nodes and connectors. */
export function sketchRoughScript(): string {
  return `
(function() {
  var FILLS = {
    outline: { stroke: '#5eead4', fill: 'transparent', fillStyle: 'solid' },
    accent: { stroke: '#f0c14b', fill: 'rgba(240, 193, 75, 0.2)', fillStyle: 'solid' },
    'accent-positive': { stroke: '#4ade80', fill: 'rgba(74, 222, 128, 0.18)', fillStyle: 'solid' },
    'accent-caution': { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.18)', fillStyle: 'solid' }
  };

  function rectRelative(el, root) {
    var er = el.getBoundingClientRect();
    var rr = root.getBoundingClientRect();
    return {
      left: er.left - rr.left,
      right: er.right - rr.left,
      top: er.top - rr.top,
      bottom: er.bottom - rr.top,
      cx: (er.left + er.right) / 2 - rr.left,
      cy: (er.top + er.bottom) / 2 - rr.top,
      width: er.width,
      height: er.height
    };
  }

  function drawNodeFrame(svg, rc, nodeEl, canvas, animated) {
    var r = rectRelative(nodeEl, canvas);
    var pad = 3;
    var x = r.left + pad;
    var y = r.top + pad;
    var w = Math.max(8, r.width - pad * 2);
    var h = Math.max(8, r.height - pad * 2);
    var fillKey = nodeEl.getAttribute('data-fill') || 'outline';
    var spec = FILLS[fillKey] || FILLS.outline;
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'sketch-rough-frame sketch-fill-' + fillKey);
    var rect = rc.rectangle(x, y, w, h, {
      roughness: 1.35,
      bowing: 1.1,
      stroke: spec.stroke,
      strokeWidth: 2,
      fill: spec.fill,
      fillStyle: spec.fillStyle
    });
    g.appendChild(rect);
    if (animated) {
      var delay = parseFloat(nodeEl.getAttribute('data-frame-delay') || '0');
      g.style.opacity = '0';
      g.style.animation = 'sketchFrameDraw 0.28s ease ' + delay + 's forwards';
    }
    svg.insertBefore(g, svg.firstChild);
  }

  function arrowZoneRect(bandEl, canvas) {
    var zone = bandEl ? bandEl.querySelector('.sketch-band-arrow-zone') : null;
    return zone ? rectRelative(zone, canvas) : (bandEl ? rectRelative(bandEl, canvas) : null);
  }

  function drawConnector(svg, rc, fromNode, toNode, bandEl, canvas, direction, delay) {
    var from = rectRelative(fromNode, canvas);
    var to = rectRelative(toNode, canvas);
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'sketch-rough-connector');
    var stroke = '#f0c14b';
    var head = 10;
    var x1, y1, x2, y2;
    var zone = arrowZoneRect(bandEl, canvas);

    if (direction === 'right') {
      if (zone) {
        var arrowY = zone.cy;
        x1 = from.right + 2;
        y1 = arrowY;
        x2 = to.left - 2;
        y2 = arrowY;
      } else {
        x1 = from.right + 4;
        y1 = from.cy;
        x2 = to.left - 4;
        y2 = to.cy;
      }
      g.appendChild(rc.line(x1, y1, x2, y2, { roughness: 1.2, bowing: 0.9, stroke: stroke, strokeWidth: 2 }));
      g.appendChild(rc.line(x2, y2, x2 - head, y2 - head * 0.45, { roughness: 0.9, stroke: stroke, strokeWidth: 2 }));
      g.appendChild(rc.line(x2, y2, x2 - head, y2 + head * 0.45, { roughness: 0.9, stroke: stroke, strokeWidth: 2 }));
    } else {
      if (zone) {
        x1 = zone.cx;
        y1 = zone.cy;
        x2 = to.cx;
        y2 = to.top + 3;
      } else {
        x1 = from.cx;
        y1 = from.bottom + 4;
        x2 = to.cx;
        y2 = to.top - 4;
      }
      g.appendChild(rc.line(x1, y1, x2, y2, { roughness: 1.2, bowing: 0.9, stroke: stroke, strokeWidth: 2 }));
      g.appendChild(rc.line(x2, y2, x2 - head * 0.45, y2 - head, { roughness: 0.9, stroke: stroke, strokeWidth: 2 }));
      g.appendChild(rc.line(x2, y2, x2 + head * 0.45, y2 - head, { roughness: 0.9, stroke: stroke, strokeWidth: 2 }));
    }

    var lag = typeof delay === 'number' ? delay : 0;
    g.style.opacity = '0';
    g.style.animation = 'sketchConnShow 0.5s ease ' + lag + 's forwards';
    svg.appendChild(g);
  }

  window.__ecpeSketchRoughDraw = function() {
    var canvas = document.querySelector('.sketch-grid-canvas');
    if (!canvas || typeof rough === 'undefined') return;
    var svg = canvas.querySelector('.sketch-overlay');
    if (!svg) return;
    var connectors = [];
    try { connectors = JSON.parse(canvas.getAttribute('data-connectors') || '[]'); } catch (e) { connectors = []; }
    var animated = canvas.getAttribute('data-animated') === 'true';

    var cRect = canvas.getBoundingClientRect();
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 ' + cRect.width + ' ' + cRect.height);
    svg.setAttribute('width', String(cRect.width));
    svg.setAttribute('height', String(cRect.height));
    var rc = rough.svg(svg);

    var nodes = Array.prototype.slice.call(canvas.querySelectorAll('.sketch-node'))
      .sort(function(a, b) { return Number(a.getAttribute('data-node')) - Number(b.getAttribute('data-node')); });

    nodes.forEach(function(node) { drawNodeFrame(svg, rc, node, canvas, animated); });

    connectors.forEach(function(c) {
      var fromEl = canvas.querySelector('.sketch-node[data-node="' + c.from + '"]');
      var toEl = canvas.querySelector('.sketch-node[data-node="' + c.to + '"]');
      if (!fromEl || !toEl) return;
      var bandEl = canvas.querySelector('[data-conn-from="' + c.from + '"][data-dir="' + (c.dir || 'down') + '"]');
      drawConnector(svg, rc, fromEl, toEl, bandEl, canvas, c.dir || 'down', c.delay);
    });
  };

  function boot() {
    if (typeof rough === 'undefined') return;
    window.__ecpeSketchRoughDraw();
    window.addEventListener('resize', window.__ecpeSketchRoughDraw);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(boot, 50); });
  } else {
    setTimeout(boot, 50);
  }
})();
`;
}
