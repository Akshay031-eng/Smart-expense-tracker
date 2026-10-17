// Small progressive enhancements. Every page works without JavaScript except
// the theme toggle, the charts and live category filtering on the form.
(function () {
  'use strict';

  // Theme toggle
  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var dark = document.documentElement.classList.toggle('dark');
      try {
        localStorage.setItem('theme', dark ? 'dark' : 'light');
      } catch (e) {
        /* ignore */
      }
      document.dispatchEvent(new CustomEvent('themechange'));
    });
  });

  // Progress bars: the CSP forbids inline style attributes, so widths are set here.
  document.querySelectorAll('[data-width]').forEach(function (el) {
    var value = Math.max(0, Math.min(100, Number(el.getAttribute('data-width')) || 0));
    el.style.width = value + '%';
  });
  document.querySelectorAll('[data-left]').forEach(function (el) {
    var value = Math.max(0, Math.min(100, Number(el.getAttribute('data-left')) || 0));
    el.style.left = value + '%';
  });

  // "Are you sure?" for destructive forms
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
    });
  });

  // Close the mobile menu when clicking outside it
  document.addEventListener('click', function (event) {
    document.querySelectorAll('details[data-menu][open]').forEach(function (menu) {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });

  // Transaction form: show only the categories that match Expense / Income
  var form = document.querySelector('[data-transaction-form]');
  if (form) {
    var select = form.querySelector('select[name="category"]');
    var title = document.querySelector('[data-form-title]');
    var submit = form.querySelector('[data-submit-label]');
    var isEdit = form.getAttribute('data-mode') === 'edit';

    var sync = function () {
      var checked = form.querySelector('input[name="type"]:checked');
      var type = checked ? checked.value : 'expense';
      select.querySelectorAll('optgroup').forEach(function (group) {
        var match = group.getAttribute('data-type') === type;
        group.hidden = !match;
        group.disabled = !match;
      });
      var selected = select.options[select.selectedIndex];
      if (selected && selected.parentElement && selected.parentElement.disabled) select.value = '';
      if (!isEdit) {
        if (title) title.textContent = type === 'income' ? 'Add income' : 'Add expense';
        if (submit) submit.textContent = type === 'income' ? 'Save income' : 'Save expense';
      }
    };
    form.querySelectorAll('input[name="type"]').forEach(function (input) {
      input.addEventListener('change', sync);
    });
    sync();
  }
})();
