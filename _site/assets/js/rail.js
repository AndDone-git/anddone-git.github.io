// AndDone reading rail: nine lines, each draining at its own rate, all empty at the foot of the post.
(function () {
  var rail = document.getElementById('ad-rail');
  if (!rail) return;

  var lines = Array.prototype.slice.call(rail.children);
  var rates = [0.5, 0.62, 0.76, 0.92, 1.1, 1.3, 1.55, 1.85, 2.2];
  var queued = false;

  function paint() {
    queued = false;
    var el = document.scrollingElement || document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
    for (var i = 0; i < lines.length; i++) {
      var r = rates[i] !== undefined ? rates[i] : 1;
      lines[i].style.height = Math.pow(1 - p, r) * 100 + 'vh';
    }
  }

  function onScroll() {
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  paint();
})();
