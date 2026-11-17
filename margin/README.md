# Margin

Article reader at https://lucasgravina.com/margin/.

Static, dependency-free HTML/CSS/JavaScript. The library lives in IndexedDB in each browser, with a localStorage recovery snapshot and optional Desktop folder backups in Chrome/Edge. Notes are not uploaded to GitHub or a shared database. Link imports call Jina Reader with the article URL; pasted text stays on the device.

Use the top-left button to collapse the library, the top-right button to collapse notes, and Groups to organize articles. Added dates appear in both the list and reader. Backup & restore supports existing desktop Margin.json files, including highlights, comments, and creation dates.

Run checks with `node --test margin/tests/core.test.cjs` from the repository root. No build step is required for GitHub Pages.
