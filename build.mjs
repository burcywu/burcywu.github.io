import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(await readFile(join(root, 'data/site.json'), 'utf8'));
const figures = JSON.parse(await readFile(join(root, 'data/figures.json'), 'utf8'));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const arrow = '<span aria-hidden="true">↗</span>';

function safeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`Only HTTPS links are allowed: ${value}`);
  return escapeHtml(url.href);
}

function localAsset(value) {
  const assetPath = resolve(root, value);
  if (!value.startsWith('assets/') || relative(root, assetPath).startsWith('..')) throw new Error(`Invalid asset path: ${value}`);
  return escapeHtml(value);
}

function externalLink(url, label, className = '') {
  return `<a class="${className}" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ${arrow}</a>`;
}

if (!site.name || !site.biography || !site.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.email)) throw new Error('Name, biography, and a valid email are required.');
safeUrl(site.siteUrl);
if (site.company) {
  if (!site.company.name?.trim() || !site.company.role?.trim()) throw new Error('Company name and role are required.');
  safeUrl(site.company.url);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(site.lastUpdated)) throw new Error('Use YYYY-MM-DD for lastUpdated.');
const paperIds = new Set();
for (const paper of site.publications) {
  if (!/^[a-z0-9-]+$/.test(paper.id) || paperIds.has(paper.id) || !paper.title || !Number.isInteger(paper.year)) throw new Error('Each publication requires a unique ASCII id, title, and integer year.');
  paperIds.add(paper.id);
  for (const link of paper.links) safeUrl(link.url);
  if (figures[paper.id]?.image) {
    localAsset(figures[paper.id].image);
    if (figures[paper.id].source) safeUrl(figures[paper.id].source);
    else if (!figures[paper.id].sourceNote) throw new Error(`Record the figure source for ${paper.id}.`);
    await access(join(root, figures[paper.id].image));
  }
}
const studentPhotoNumbers = new Set();
for (const student of site.students) {
  if (student.publish && !student.name.trim()) throw new Error(`Confirm the name before publishing ${student.id}.`);
  if (student.photoConfirmed) {
    if (!Number.isInteger(student.photoNumber) || student.photoNumber < 1 || studentPhotoNumbers.has(student.photoNumber) || !student.role?.trim()) throw new Error(`Confirmed student photos require a unique positive number and role: ${student.id}.`);
    studentPhotoNumbers.add(student.photoNumber);
  }
  if (!['current', 'alumni'].includes(student.status)) throw new Error(`Choose current or alumni for ${student.id}.`);
  if (!/^\d{1,3}% \d{1,3}%$/.test(student.photoPosition)) throw new Error(`Invalid photo position: ${student.id}`);
  localAsset(student.photo);
  await access(join(root, student.photo));
}
if (site.portrait) {
  if (![site.portraitWidth, site.portraitHeight].every((value) => Number.isInteger(value) && value > 0)) throw new Error('Record the original portrait width and height.');
  localAsset(site.portrait);
  await access(join(root, site.portrait));
}
if (!site.recruitment.text?.trim()) throw new Error('Recruitment text is required.');
if (site.recruitment.photo) {
  const photo = site.recruitment.photo;
  if (![photo.width, photo.height].every((value) => Number.isInteger(value) && value > 0) || !photo.alt?.trim()) throw new Error('Record the group photo dimensions and description.');
  localAsset(photo.image);
  await access(join(root, photo.image));
}

const emailLink = `mailto:${escapeHtml(site.email)}`;
const publications = [...site.publications].sort((first, second) => second.year - first.year);
const updated = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${site.lastUpdated}T12:00:00Z`));

function authorsHtml(paper) {
  if (!paper.authors.length) return `<strong>${escapeHtml(site.name)}${paper.role === 'Corresponding author' ? '<sup>*</sup>' : ''}</strong><span class="author-pending"> · Full author list pending</span>`;
  return paper.authors.map((author) => author === site.name ? `<strong>${escapeHtml(author)}${paper.role === 'Corresponding author' ? '<sup>*</sup>' : ''}</strong>` : escapeHtml(author)).join(', ');
}

function figureHtml(paper) {
  const figure = figures[paper.id];
  if (!figure?.image) return '<div class="paper-figure figure-pending"><span>Original figure pending</span><small>Original PDF needed</small></div>';
  return `<figure class="paper-figure"><a class="figure-link" href="${localAsset(figure.image)}" target="_blank" rel="noopener" aria-label="Enlarge ${escapeHtml(figure.label)} from ${escapeHtml(paper.title)}"><img src="${localAsset(figure.image)}" alt="${escapeHtml(figure.alt)}" width="${figure.width}" height="${figure.height}" loading="lazy" decoding="async"></a></figure>`;
}

function paperHtml(paper, compact = false) {
  const links = paper.links.length ? paper.links : [{ label: 'Scholar search', url: `https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}` }];
  return `<li class="publication${compact ? ' compact' : ''}" id="paper-${escapeHtml(paper.id)}"><div class="paper-copy">
    <div class="paper-meta"><span class="venue" title="${escapeHtml(paper.venueFull)}">${escapeHtml(paper.venue)} ${paper.year}</span>${paper.award ? `<span class="paper-award">${escapeHtml(paper.award)}</span>` : ''}</div>
    <h3>${escapeHtml(paper.title)}</h3><p class="authors">${authorsHtml(paper)}</p>
    <div class="paper-links">${links.map((link) => externalLink(link.url, link.label)).join('')}</div>
  </div>${compact ? '' : figureHtml(paper)}</li>`;
}

function backgroundHtml() {
  return `<ol class="timeline">${site.background.map((entry) => `<li><span class="timeline-year">${escapeHtml(entry.year)}</span><div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.institution)}</p>${entry.detail ? `<p class="muted">${escapeHtml(entry.detail)}</p>` : ''}</div></li>`).join('')}</ol>`;
}

function teachingHtml() {
  return `<ul class="teaching-list">${site.teaching.map((course) => `<li><div><h3>${escapeHtml(course.title)}</h3><p class="muted">${escapeHtml(course.detail)}</p></div><span class="course-term">${escapeHtml(course.term)}</span></li>`).join('')}</ul>`;
}

function head(title, description, preview = false, cv = false) {
  const canonical = `${site.siteUrl}/${cv ? 'cv.html' : ''}`;
  const structuredData = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: site.name, url: site.siteUrl, jobTitle: site.title, affiliation: { '@type': 'CollegeOrUniversity', name: site.university }, email: site.email, sameAs: Object.values(site.links) }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#ffffff">
  ${preview ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${safeUrl(canonical)}">`}
  <meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${safeUrl(canonical)}">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="styles.css">
  <script src="main.js" defer></script><script type="application/ld+json">${structuredData}</script>
</head>`;
}

function header(cv = false) {
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container header-inner">
    <a href="${cv ? 'index.html' : '#about'}" class="brand">${escapeHtml(site.name)}</a>
    <nav aria-label="Main navigation">${cv ? '<a href="index.html">Back to homepage ↗</a><button class="button small" type="button" data-print hidden>Print / Save as PDF</button>' : '<a href="#about">About</a><a href="#publications">Publication</a><a href="#people">People</a><a href="#teaching">Teaching</a><a class="nav-contact" href="#join">Join My Group</a>'}</nav>
  </div></header>`;
}

function footer() {
  return `<footer class="site-footer container"><div><a href="index.html">${escapeHtml(site.name)}</a><span>${escapeHtml(site.university)}</span></div><div><span>Updated ${escapeHtml(updated)}</span><a href="#main">Back to top ↑</a></div></footer>`;
}

function visibleStudents(preview = false) {
  return site.students.filter((student) => preview || student.publish || student.photoConfirmed || site.showStudentPlaceholders);
}

function studentHtml(student, index) {
  const photoNumber = String(student.photoNumber).padStart(2, '0');
  const label = student.name || (student.photoConfirmed ? `Photo ${photoNumber}` : `${student.status === 'current' ? 'Student' : 'Graduate'} ${String(index + 1).padStart(2, '0')}`);
  const alt = student.name ? `Portrait of ${student.name}` : student.photoConfirmed ? `${student.role} portrait ${photoNumber}; name pending.` : `Repeated placeholder portrait for ${student.status === 'current' ? 'current students' : 'alumni'}, slot ${index + 1}`;
  const image = `<img src="${localAsset(student.photo)}" width="500" height="500" style="object-position: ${escapeHtml(student.photoPosition)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
  const portrait = student.photoConfirmed ? `<a class="student-portrait-link" href="${localAsset(student.photo)}" target="_blank" rel="noopener" aria-label="View full portrait for ${escapeHtml(label)}">${image}</a>` : image;
  const note = student.photoConfirmed && !student.name ? '<p class="profile-pending">Name and year pending</p>' : !student.photoConfirmed && !student.publish ? '<p class="draft-label">Photo placeholder</p>' : '';
  const affiliation = student.affiliation || (student.name ? 'Affiliation to be added' : '');
  return `<article class="person-card" data-student-id="${escapeHtml(student.id)}"${student.photoConfirmed ? ` data-photo-number="${photoNumber}"` : ''}>${portrait}<div class="person-details"><h4>${escapeHtml(label)}</h4>${student.role ? `<p class="student-degree">${escapeHtml(student.role)}</p>` : ''}${affiliation ? `<p class="person-affiliation${student.affiliation ? '' : ' affiliation-pending'}">${escapeHtml(affiliation)}</p>` : ''}${student.detail ? `<p class="muted">${escapeHtml(student.detail)}</p>` : ''}${note}</div></article>`;
}

function studentsHtml(preview) {
  return ['current', 'alumni'].map((status) => {
    const students = visibleStudents(preview).filter((student) => student.status === status);
    const label = status === 'current' ? 'Current Students' : 'Alumni';
    return `<div class="people-group" data-student-group="${status}"><h3 class="people-subheading">${label}</h3>${students.length ? `<div class="people-grid">${students.map((student, index) => studentHtml(student, index)).join('')}</div>` : '<p class="muted group-pending">Profiles will be added after confirmation.</p>'}</div>`;
  }).join('');
}

function recruitmentHtml() {
  const text = escapeHtml(site.recruitment.text)
    .replace('If you are interested in joining my group,', '<br>If you are interested in joining my group,')
    .replace(escapeHtml(site.email), `<a href="${emailLink}">${escapeHtml(site.email)}</a>`);
  const photo = site.recruitment.photo;
  return `<p class="recruitment-copy">${text}</p>${photo ? `<figure class="group-photo"><div class="group-photo-frame"><img src="${localAsset(photo.image)}" width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async"></div>${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}</figure>` : ''}`;
}

function homepage(preview = false) {
  const extraCount = Math.max(0, publications.length - 5);
  const researchStatement = [escapeHtml(site.intro), escapeHtml(site.recognition), site.company ? `I am also the ${escapeHtml(site.company.role)} of <a href="${safeUrl(site.company.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site.company.name)}</a>.` : ''].filter(Boolean).join(' ');
  return `${head(`${site.name} | ${site.university}`, `${site.name}, ${site.title} at ${site.university}. ${site.intro}`, preview)}
<body${preview ? ' class="is-preview"' : ''}>
  ${preview ? '<div class="preview-banner">Local preview</div>' : ''}${header()}
  <main id="main" class="container">
    <section class="hero" id="about" aria-labelledby="name-heading"><div class="hero-copy">
      <h1 id="name-heading">${escapeHtml(site.name)}</h1>
      <a class="hero-email" href="${emailLink}">${escapeHtml(site.email)}</a>
      <p class="position"><strong>${escapeHtml(site.title)}</strong><strong>${escapeHtml(site.supervision)}</strong></p>
      <p class="affiliation">${escapeHtml(site.school)}, ${escapeHtml(site.university)}</p>
      <p class="biography">${escapeHtml(site.biography)}</p><p class="biography research-statement">${researchStatement}</p>
      <div class="hero-links">${externalLink(site.links.scholar, 'Google Scholar')}${externalLink(site.links.github, 'GitHub')}${externalLink(site.links.university, 'ZJU profile')}</div>
    </div><div class="portrait-panel">${site.portrait ? `<img class="portrait" src="${localAsset(site.portrait)}" alt="Portrait of ${escapeHtml(site.name)}" width="${site.portraitWidth}" height="${site.portraitHeight}" fetchpriority="high" decoding="async">` : '<div class="monogram">BW</div>'}</div></section>
    <section class="section publications-section" id="publications" aria-labelledby="publications-heading"><div class="section-heading"><h2 id="publications-heading">Publications</h2>${externalLink(site.links.scholar, 'Google Scholar', 'text-link')}</div>
      <ol class="publication-list featured-publications">${publications.slice(0, 5).map((paper) => paperHtml(paper)).join('')}</ol>
      ${extraCount ? `<details class="more-publications" id="more-publications"><summary><span data-expand-label>Show more publications (${extraCount})</span><span class="expand-arrow" aria-hidden="true">⌄</span></summary><ol class="publication-list" start="6">${publications.slice(5).map((paper) => paperHtml(paper)).join('')}</ol><button class="button small collapse-publications" type="button" data-collapse-publications hidden>Show fewer publications ↑</button></details>` : ''}
    </section>
    <section class="section" id="people" aria-labelledby="people-heading"><div class="section-heading"><h2 id="people-heading">People</h2></div>${studentsHtml(preview)}</section>
    <section class="section" id="teaching" aria-labelledby="teaching-heading"><div class="section-heading"><h2 id="teaching-heading">Teaching</h2></div>${teachingHtml()}</section>
    <section class="join-section" id="join" aria-labelledby="join-heading"><h2 id="join-heading">${escapeHtml(site.recruitment.heading)}</h2>${recruitmentHtml()}</section>
  </main>${footer()}
</body></html>
`;
}

function cvPage() {
  return `${head(`${site.name} | Curriculum Vitae`, `Academic background, teaching, and publications of ${site.name}.`, false, true)}<body class="cv-page">${header(true)}<main id="main" class="container cv-content"><p class="eyebrow">Curriculum vitae</p><h1>${escapeHtml(site.name)}</h1><p class="position">${escapeHtml(site.title)} · ${escapeHtml(site.supervision)}</p><p>${escapeHtml(site.school)}, ${escapeHtml(site.university)}<br><a href="${emailLink}">${escapeHtml(site.email)}</a></p><p class="cv-updated">Updated ${escapeHtml(updated)}</p><section><h2>Research interests</h2><p>${site.research.map((topic) => escapeHtml(topic.name)).join(' · ')}</p></section><section><h2>Education & research experience</h2>${backgroundHtml()}</section><section><h2>Teaching</h2>${teachingHtml()}</section><section><h2>Selected publications</h2><ol class="publication-list">${publications.map((paper) => paperHtml(paper, true)).join('')}</ol></section></main>${footer()}</body></html>`;
}

await writeFile(join(root, 'index.html'), homepage());
await writeFile(join(root, 'preview.html'), homepage(true));
await writeFile(join(root, 'cv.html'), cvPage());
const output = join(root, '_site');
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
for (const file of ['index.html', 'cv.html', 'styles.css', 'main.js']) await cp(join(root, file), join(output, file));
await cp(join(root, 'assets/favicon.svg'), join(output, 'assets/favicon.svg'));
const publishAssets = new Set(visibleStudents().map((entry) => entry.photo));
if (site.portrait) publishAssets.add(site.portrait);
if (site.recruitment.photo) publishAssets.add(site.recruitment.photo.image);
for (const figure of Object.values(figures)) if (figure.image) publishAssets.add(figure.image);
for (const asset of publishAssets) {
  await mkdir(dirname(join(output, asset)), { recursive: true });
  await cp(join(root, asset), join(output, asset));
}
await writeFile(join(output, '.nojekyll'), '');
await writeFile(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', '/cv.html'].map((path) => `<url><loc>${escapeHtml(site.siteUrl + path)}</loc><lastmod>${site.lastUpdated}</lastmod></url>`).join('')}</urlset>`);
await writeFile(join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}/sitemap.xml\n`);
const hostname = new URL(site.siteUrl).hostname;
if (!hostname.endsWith('.github.io')) await writeFile(join(output, 'CNAME'), `${hostname}\n`);
console.log(`Built ${publications.length} publications (${Object.values(figures).filter((figure) => figure.image).length} original figures); 5 initially visible. Students: ${site.students.filter((student) => student.status === 'current').length} current / ${site.students.filter((student) => student.status === 'alumni').length} alumni, ${site.students.filter((student) => student.photoConfirmed).length} supplied student portraits. Deployment folder: _site/`);
