# Margin

Article reader at https://lucasgravina.com/margin/.

The cloud upgrade uses a password-protected private notebook service. Password-derived credentials stay in memory; the password and its verifier are absent from the public source. Reads and writes are authorized on the server. The browser retains a recovery snapshot, and optional Desktop backups remain available.

Cloud writes compare revisions and object versions, retain prior revisions, and merge concurrent article/comment changes. Conflicting edits to a comment retain both variants. The standalone localhost version continues to save locally. Link imports use Jina Reader; notes are never included in import requests.

Use the top-left button to collapse the library, the top-right button to collapse notes, and Groups to organize articles. Added dates appear in both the list and reader. Backup & restore supports existing desktop Margin.json files, including highlights, comments, and creation dates.

Run checks with `node --test margin/tests/core.test.cjs` from the repository root. No build step is required for GitHub Pages.
