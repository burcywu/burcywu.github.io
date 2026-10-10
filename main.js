const morePublications = document.querySelector('#more-publications');
if (morePublications) {
  const expandLabel = morePublications.querySelector('[data-expand-label]');
  const collapsedLabel = expandLabel.textContent;
  const collapseButton = morePublications.querySelector('[data-collapse-publications]');
  let wasOpenBeforePrint = false;
  morePublications.addEventListener('toggle', () => {
    expandLabel.textContent = morePublications.open ? 'Show fewer publications' : collapsedLabel;
  });
  collapseButton.hidden = false;
  collapseButton.addEventListener('click', () => {
    morePublications.open = false;
    expandLabel.textContent = collapsedLabel;
    const summary = morePublications.querySelector('summary');
    summary.focus();
    if (summary.scrollIntoView) summary.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  window.addEventListener('beforeprint', () => {
    wasOpenBeforePrint = morePublications.open;
    morePublications.open = true;
  });
  window.addEventListener('afterprint', () => {
    morePublications.open = wasOpenBeforePrint;
  });
}

const printButton = document.querySelector('[data-print]');
if (printButton) {
  printButton.hidden = false;
  printButton.addEventListener('click', () => window.print());
}

const sectionLinks = [...document.querySelectorAll('nav a[href^="#"]')];
if (sectionLinks.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of sectionLinks) {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
  for (const link of sectionLinks) {
    const section = document.querySelector(link.hash);
    if (section) observer.observe(section);
  }
}
