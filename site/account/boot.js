/* «Мои дела»: до отрисовки — признак JS (без него формы входа скрыты) и тема марки, с сайта которой пришли:
   ?brand=sledami или домен sledami.ru (docs/account.md, ADR-5, «Тема»). Отдельный файл, а не встроенный скрипт, — из-за CSP. */
(function () {
  var d = document.documentElement;
  d.className += (d.className ? ' ' : '') + 'js';
  try {
    var b = (location.search.match(/[?&]brand=([a-z]+)/) || [])[1] || (/(^|\.)sledami\.ru$/.test(location.hostname) ? 'sledami' : '');
    if (b === 'sledami') d.setAttribute('data-brand', 'sledami');
  } catch (e) { /* тема по умолчанию */ }
})();
