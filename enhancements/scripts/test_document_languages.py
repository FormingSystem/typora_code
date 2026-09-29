"""Check paired documentation and local English links without network access."""
import json
import re
from pathlib import Path
from urllib.parse import unquote

repository_root = Path(__file__).resolve().parents[2]
manifest = json.loads((repository_root / 'docs/languages.json').read_text(encoding='utf-8'))
failures = []
checks = 0
for pair in manifest['documents']:
    chinese_path = repository_root / pair['zh_cn']
    english_path = repository_root / pair['en']
    for target in (chinese_path, english_path):
        assert target.is_file(), str(target)
    english = english_path.read_text(encoding='utf-8-sig')
    for language in ('en', 'zh_cn'):
        page_path = repository_root / pair[language]
        for number, line in enumerate(page_path.read_text(encoding='utf-8-sig').splitlines(), 1):
            visible = re.sub(r'\]\([^)]*\)|<[^>]+>', '', line)
            if language == 'en' and re.search(r'[\u3400-\u9fff]', visible):
                failures.append(f'{pair[language]}:{number}: Chinese text in English page')
            for link in re.findall(r'(?<!!)\[[^]]*\]\(([^\s)]+)\)', line):
                if re.match(r'^[a-z][a-z0-9+.-]*:', link, re.I):
                    continue
                path, _, fragment = link.partition('#')
                target = (page_path.parent / unquote(path)).resolve() if path else page_path
                if not target.exists():
                    failures.append(f'{pair[language]}:{number}: missing {link}')
                    continue
                if fragment and target.suffix == '.md':
                    body = target.read_text(encoding='utf-8-sig')
                    anchors = re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)', body)
                    counts = {}
                    for heading in re.findall(r'^#{1,6}\s+(.*)', body, re.M):
                        heading = re.sub(r'\[([^]]+)\]\([^)]*\)', r'\1', heading)
                        anchor = re.sub(r'[^\w\- ]', '', heading.replace('`', '').lower()).replace(' ', '-')
                        occurrence = counts.get(anchor, 0)
                        counts[anchor] = occurrence + 1
                        anchors.append(anchor + (f'-{occurrence}' if occurrence else ''))
                    if unquote(fragment) not in anchors:
                        failures.append(f'{pair[language]}:{number}: missing anchor {link}')
                checks += 1
    assert chinese_path.name in unquote(english), f'Missing Chinese switch: {pair["en"]}'
    assert english_path.name in unquote(chinese_path.read_text(encoding='utf-8-sig')), f'Missing English switch: {pair["zh_cn"]}'
assert not failures, '\n'.join(failures)
print(json.dumps({'status': 'PASS', 'pairs': len(manifest['documents']), 'links': checks}))
