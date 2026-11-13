"""Read-only verification of packaged spiral reviews.

Run from the public repository: python3 tools/check_spiral_reviews.py
The manifest identifies each source bundle and the exact exported learner assets.
This checks local files, not GitHub Pages deployment or LMS embedding.
"""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'script' and 'src' in attributes:
            self.urls.append(attributes['src'])
        if tag == 'link' and attributes.get('rel') == 'stylesheet':
            self.urls.append(attributes['href'])


def verify(root):
    root = Path(root).resolve()
    manifest = json.loads((root / 'practice/spiral_reviews.json').read_text())
    assert manifest['schema'] == 1 and manifest['reviews'], 'Empty or unsupported manifest'
    seen = set()
    for review in manifest['reviews']:
        relative = review['path']
        assert re.fullmatch(r'practice/[a-z][a-z0-9_]*', relative), relative
        assert relative not in seen, 'Duplicate review path'
        seen.add(relative)
        folder = (root / relative).resolve()
        assert root in folder.parents, 'Review outside repository'
        expected = review['files']
        assert set(expected) == {'index.html', 'model.js', 'review.js', 'visuals.js', 'review.css'}, relative
        assert {p.name for p in folder.iterdir()} == set(expected), 'Unexpected files in ' + relative
        for name, digest in expected.items():
            path = folder / name
            assert path.is_file() and not path.is_symlink(), str(path)
            assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, 'Changed asset: ' + relative + '/' + name
        parser = Resources()
        parser.feed((folder / 'index.html').read_text())
        assert len(parser.urls) == 4, 'Expected four local page resources'
        versions = set()
        resources = set()
        for url in parser.urls:
            parts = urlsplit(url)
            assert not parts.scheme and not parts.netloc and not parts.path.startswith('/'), url
            assert re.fullmatch(r'v=[a-f0-9]{12}', parts.query), 'Missing asset version: ' + url
            asset = (folder / unquote(parts.path)).resolve()
            assert asset.parent == folder and asset.is_file(), 'Missing or escaping resource: ' + url
            resources.add(asset.name)
            versions.add(parts.query)
        assert resources == {'model.js', 'review.js', 'visuals.js', 'review.css'} and len(versions) == 1, relative
    return len(seen)


if __name__ == '__main__':
    repo = Path(__file__).resolve().parents[1]
    try:
        count = verify(repo)
    except (AssertionError, OSError, ValueError, KeyError) as error:
        raise SystemExit('Spiral review check failed: ' + str(error))
    print(str(count) + ' spiral review bundles match their manifests and local resource links.')
