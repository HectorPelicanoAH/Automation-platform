# Phase 0 validation procedure and evidence

The checker below uses Python's standard library and Git only. It inspects documentation, phase gates and scope; it does not run or simulate application tests. Run it from the repository root after extracting its fenced block into a temporary file. It supports the existing Python 3.9 environment and installs nothing.

```python
from pathlib import Path
from collections import Counter
from urllib.parse import unquote, urlsplit
import re
import subprocess

root = Path.cwd().resolve()
files = sorted(p for p in root.rglob('*') if p.is_file()
               and '.git' not in p.relative_to(root).parts)
docs = [p for p in files if p.suffix == '.md']
errors = []

def check(condition, message):
    if not condition:
        errors.append(message)

def visible_lines(path):
    result, fence = [], None
    for line in path.read_text(encoding='utf-8').splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            token = marker.group(1)
            if fence is None:
                fence = token[0]
            elif token[0] == fence:
                fence = None
            continue
        if fence is None:
            result.append(line)
    check(fence is None, 'Unclosed fence: ' + str(path.relative_to(root)))
    return result

visible = {p: visible_lines(p) for p in docs}
anchors = {}
for path, lines in visible.items():
    found, counts = set(), Counter()
    for line in lines:
        match = re.match(r'^#{1,6}\s+(.+?)\s*#*$', line)
        if match:
            slug = re.sub(r'[^\w\- ]', '', match.group(1).lower()).replace(' ', '-')
            number = counts[slug]
            counts[slug] += 1
            found.add(slug if number == 0 else slug + '-' + str(number))
    anchors[path] = found

links = 0
for path, lines in visible.items():
    for line in lines:
        for label, destination in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', line):
            url = urlsplit(destination.strip('<>'))
            if url.scheme or url.netloc:
                continue
            links += 1
            target = (path.parent / unquote(url.path)).resolve() if url.path else path
            check(target == root or root in target.parents, 'Link escapes root: ' + destination)
            check(target.is_file(), 'Missing link: ' + str(path.relative_to(root)) + ' -> ' + destination)
            if url.fragment and target in anchors:
                check(unquote(url.fragment) in anchors[target], 'Missing anchor: ' + destination)

required = ['README.md', 'AGENTS.md', 'docs/architecture.md', 'docs/domain-model.md',
            'docs/security.md', 'docs/recording.md', 'docs/roadmap.md',
            'docs/phase-status.md', 'docs/phase-1-plan.md', 'docs/quality-standards.md',
            'docs/risks-and-open-questions.md', 'docs/sources.md', 'docs/autohealth.md',
            'docs/knowledge/README.md', 'docs/skills/README.md',
            'docs/evaluations/README.md', 'docs/evaluations/cases-v1.md',
            'docs/phase-0-report.md', 'docs/phase-0-validation.md',
            'docs/decisions/README.md']
for name in required:
    check((root / name).is_file(), 'Required document absent: ' + name)
adrs = sorted((root / 'docs/decisions').glob('0*.md'))
check(len(adrs) == 8, 'Expected eight ADRs')
for path in adrs:
    content = path.read_text()
    for section in ['Context', 'Decision', 'Alternatives', 'Consequences', 'Validation and revisit']:
        check('## ' + section in content, 'ADR section absent: ' + str(path.name) + ': ' + section)

states = {'PROPOSED', 'APPROVED', 'IN_PROGRESS', 'VALIDATION', 'COMPLETED', 'BLOCKED'}
table = (root / 'docs/phase-status.md').read_text()
rows = re.findall(r'^\| ([0-6]) \| [^|]+ \| ([A-Z_]+) \|', table, re.M)
check(len(rows) == 7 and len({n for n, _ in rows}) == 7, 'Missing/duplicate phase row')
for phase, status in rows:
    check(status in states, 'Invalid phase state: ' + status)
    if phase != '0':
        check(status == 'PROPOSED', 'Unapproved future phase: ' + phase)
    else:
        check(status in {'VALIDATION', 'COMPLETED'}, 'Phase 0 not ready for report')

check(len((root / 'AGENTS.md').read_text().split()) <= 500, 'AGENTS exceeds word budget')
cases = (root / 'docs/evaluations/cases-v1.md').read_text()
for number in range(1, 15):
    check('E' + str(number).zfill(2) + ' / ' in cases, 'Evaluation case absent: ' + str(number))
check('NOT_RUN' in cases, 'Evaluation execution status missing')
report = (root / 'docs/phase-0-report.md').read_text()
for heading in ['IMPLEMENTED', 'ARCHITECTURAL DECISIONS', 'VALIDATION', 'KNOWLEDGE',
                'QUALITY', 'NEXT PHASE', 'APPROVAL REQUIRED']:
    check('## ' + heading in report, 'Report section absent: ' + heading)
for number in range(1, 13):
    check('P1-' + str(number).zfill(2) in (root / 'docs/phase-1-plan.md').read_text(),
          'Phase 1 criterion absent: ' + str(number))

for path in files:
    relative = path.relative_to(root).as_posix()
    check(relative == '.gitattributes' or path.suffix == '.md', 'Non-document scope: ' + relative)
    if path.suffix == '.md':
        result = subprocess.run(['git', 'diff', '--no-index', '--check', '/dev/null', str(path)],
                                text=True, capture_output=True)
        check(result.returncode in (0, 1) and not result.stdout and not result.stderr,
              'Whitespace: ' + relative + ': ' + result.stdout + result.stderr)

if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print('PASS: %d Markdown files, %d local links, %d ADRs, 7 phase states, '
      '14 evaluation cases, 12 Phase 1 criteria, scope and whitespace checks' % (len(docs), links, len(adrs)))
```

Reproduce from the repository root (temporary paths are diagnostic outputs, not project implementation):

```sh
python3 - <<'PY'
from pathlib import Path
source = Path('docs/phase-0-validation.md').read_text()
code = source.split('```python\n', 1)[1].split('\n```', 1)[0]
Path('/tmp/automation-platform-phase0-check.py').write_text(code + '\n')
PY
python3 /tmp/automation-platform-phase0-check.py
git diff --check
git status --short
```

The link check supports the ordinary inline relative links and heading fragments used in this documentation; it is not a complete Markdown specification validator. The scope check deliberately allows only Markdown and the pre-existing `.gitattributes`, outside `.git`. The all-file whitespace check accepts `git diff --no-index` exit 1 with empty output as an ordinary content difference; warnings or other failures fail the check. Future phase acceptance needs its own changed scope and tests.

## Evidence record

Date: 2026-11-05. Environment: local macOS development workspace, Python 3.9.6. No dependencies installed. Remote documentation sources were fetched/read; upstream links are cited, not availability-tested as part of the local checker.

Executed `python3 /tmp/automation-platform-phase0-check.py` after the extraction command above, exit 0:

```text
PASS: 28 Markdown files, 69 local links, 8 ADRs, 7 phase states, 14 evaluation cases, 12 Phase 1 criteria, scope and whitespace checks
```

Executed `git diff --check`, exit 0, no whitespace diagnostics. All-file no-index checks also cover untracked documents. `git status --short` shows only new `AGENTS.md`, `README.md`, and `docs/`; the pre-existing `.gitattributes` is unchanged. No commit or push was made.

The first checker run returned false whitespace failures because it expected exit 0 from `git diff --no-index --check` on new files. Git returned ordinary difference exit 1 with empty output. The checker was corrected to accept that state while still rejecting diagnostics/errors, then rerun successfully. This was a checker issue, with no unresolved document whitespace failures.

Missing validation: all application/runtime/recorder/provider/native-runner checks, performance benchmarks and visual Mermaid rendering. The v1 behavioral cases are all `NOT_RUN`.
