(function () {
  'use strict';

  const motion = document.querySelector('#titleMotion');
  const pace = document.querySelector('#titleWatchSpeed');
  const titleStatus = document.querySelector('#titleStatus');
  document.querySelector('#titleResetOptions').addEventListener('click', () => {
    motion.checked = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pace.value = '850';
    titleStatus.textContent = 'Motion and pace reset. Save to keep these settings.';
    motion.focus();
  });

  const about = document.querySelector('#titleAboutPanel');
  const version = document.querySelector('[data-title-version]').textContent.trim();
  about.querySelector('[data-about-version]').textContent = version;
  about.querySelector('[data-about-battle-build]').textContent =
    document.querySelector('meta[name="call-sheet-build"]')?.content || 'Development';
  if (window.DynastyStorage?.kind === 'desktop') {
    about.querySelector('[data-about-save-heading]').textContent = 'Desktop saves + complete exports';
  }

  const reportButton = about.querySelector('[data-about-copy-report]');
  const reportStatus = about.querySelector('[data-about-report-status]');
  reportButton.addEventListener('click', async () => {
    const report = window.DynastyCrashGuard?.report?.() || `Call Sheet ${version}\n${navigator.userAgent}`;
    try {
      await navigator.clipboard.writeText(report);
      reportStatus.textContent = 'Details copied. Paste them into the issue.';
    } catch {
      let field = about.querySelector('[data-about-report-text]');
      if (!field) {
        field = document.createElement('textarea');
        field.dataset.aboutReportText = '';
        field.readOnly = true;
        field.setAttribute('aria-label', 'Problem details');
        field.className = 'title-about-report-text';
        reportStatus.after(field);
      }
      field.value = report;
      field.focus();
      field.select();
      reportStatus.textContent = 'Select and copy the details below.';
    }
  });
})();
