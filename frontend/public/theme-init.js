// pre-hydration theme (no FOUC) - external file so CSP stays script-src 'self'
(function () {
  try {
    var s = localStorage.getItem('cvantage.theme');
    var t =
      s === 'light' || s === 'dark'
        ? s
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
