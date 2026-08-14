---
layout: post
title: "Placeholder: testing the site"
date: 2026-08-14
cve: "CVE-pending"
status: unpatched
summary: "Temporary post to check that layout, code blocks and tables render. Delete once the real writeup goes up."
---

This post exists only to confirm the site builds and looks right. Delete it
before publishing anything real.

## Headings look like this

Body text sits at a comfortable measure, in a serif face, while identifiers and
metadata use monospace. The split is deliberate: the machine-readable layer
(dates, CVE numbers, status) is visually distinct from the prose.

### A smaller heading

Inline `code` looks like this, and a longer block:

```php
$result = @unserialize($postResult);
if ($result === false && serialize(false) !== $postResult) {
    throw new CompanyClientException("failed to unserialize server result\n$postResult", ...);
}
```

Tables scroll horizontally on narrow screens rather than breaking the layout:

| | Class | CVE | CVSS 3.1 |
|---|---|---|---|
| **Vuln 1** | Unauthenticated arbitrary file read | `CVE-0000-00000` | 9.1 |
| **Vuln 2** | Unauthenticated RCE | `CVE-0000-00001` | 10.0 |

> Block quotes are useful for pulling out a vendor response, or the lack of one.

Images get a thin border so screenshots do not bleed into the page background.
