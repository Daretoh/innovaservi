// InnovaServi — mejoras propias (navbar, contadores, hero fade, parallax).
// Convive con js/main.js (reveal, menú).
document.addEventListener('DOMContentLoaded', function () {

  var navbar = document.getElementById('navbar');
  var heroContent = document.querySelector('.iv-hero-content');
  var heroBottom = document.querySelector('.iv-hero-bottom');
  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ticking = false;

  function update() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset || 0;
    var vh = window.innerHeight || 800;

    // Navbar sólida al bajar
    if (navbar) navbar.classList.toggle('scrolled', y > 40);

    // Hero: se desvanece al bajar y reaparece al subir (como al recargar)
    if (heroContent && !reduce) {
      if (y < 4) {
        heroContent.style.opacity = ''; heroContent.style.transform = '';
        if (heroBottom) heroBottom.style.opacity = '';
      } else {
        var p = Math.min(y / (vh * 0.7), 1);
        heroContent.style.opacity = (1 - p).toFixed(3);
        heroContent.style.transform = 'translateY(' + (p * 40).toFixed(1) + 'px)';
        if (heroBottom) heroBottom.style.opacity = (1 - Math.min(p * 1.5, 1)).toFixed(3);
      }
    }

    // Parallax de imágenes (la imagen se mueve distinto que el texto)
    if (!reduce) {
      for (var i = 0; i < parallaxEls.length; i++) {
        var el = parallaxEls[i];
        var host = el.parentElement;
        var rect = host.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > vh + 100) continue;
        var offset = (rect.top + rect.height / 2 - vh / 2) * -0.09;
        el.style.transform = 'scale(1.12) translate3d(0,' + offset.toFixed(1) + 'px,0)';
      }
    }
  }

  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();

  // Contadores animados en la banda de estadísticas
  var stats = document.querySelectorAll('.iv-stat-num[data-count]');
  if (stats.length) {
    var seen = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !seen) {
          seen = true;
          stats.forEach(function (el) {
            var target = parseInt(el.getAttribute('data-count'), 10) || 0;
            var start = null, dur = 1400;
            function tick(ts) {
              if (!start) start = ts;
              var pr = Math.min((ts - start) / dur, 1);
              el.textContent = Math.floor((1 - Math.pow(1 - pr, 3)) * target);
              if (pr < 1) requestAnimationFrame(tick); else el.textContent = target;
            }
            requestAnimationFrame(tick);
          });
        }
      });
    }, { threshold: 0.4 });
    var bandEl = document.querySelector('.iv-stats');
    if (bandEl) io.observe(bandEl);
  }

});
