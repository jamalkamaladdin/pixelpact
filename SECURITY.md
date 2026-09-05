# Security Policy

## Supported Versions

pixelpact is currently pre 1.0. Only the latest published version of each
package receives security fixes.

| Package | Version | Supported |
|---|---|---|
| `pixelpact` | latest 0.x | yes |
| `pixelpact-core` | latest 0.x | yes |
| `pixelpact-mcp` | latest 0.x | yes |
| any package | older 0.x | no |

Once the project reaches 1.0, this table will be updated with a real support
window.

## Reporting a Vulnerability

Please do not open a public issue for a security report. Use GitHub private
vulnerability reporting instead:

1. Go to the [Security tab](https://github.com/jamalkamaladdin/pixelpact/security) of this repository.
2. Click "Report a vulnerability".
3. Describe the issue and, if you can, a way to reproduce it.

You should get a first response within 72 hours.

## A note on what this tool does

pixelpact drives a headless browser (Playwright) against a url you give it,
and can also load a visual contract file that was extracted from a page. A
contract or a reference url that came from a page you do not control should
be treated as untrusted input: do not point pixelpact at a url or load a
contract file that came from an untrusted source without the same caution
you would apply to running a script from that source.
