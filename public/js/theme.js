// Runs before the page paints, so a dark-theme user never sees a white flash.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('theme');
  } catch (e) {
    // Storage blocked (private mode): fall back to the system setting.
  }
  var dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
})();
