"""Formative message-passing runner; also executable under CPython for tests."""
import contextlib
import copy
import io
import json
import math
import numbers
import reprlib
import traceback

CASES = [
    {'id': 'five-nodes', 'name': 'Five connected nodes', 'features': [1, 2, 3, 4, 5],
     'edges': [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4]]},
    {'id': 'unequal-degrees', 'name': 'One busy node', 'features': [2, -1, 5, 3, 7],
     'edges': [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2]]},
    {'id': 'isolated-node', 'name': 'A node on its own', 'features': [3, 8, -2, 6, 11],
     'edges': [[0, 1], [1, 2], [2, 3]]},
    {'id': 'changed-features', 'name': 'Same links, new values', 'features': [8, 0, -3, 2, 6],
     'edges': [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4]]},
]

class BoundedOutput(io.TextIOBase):
    def __init__(self):
        self.parts = []
        self.remaining = 2000
        self.truncated = False
    def write(self, text):
        text = str(text)
        if self.remaining:
            self.parts.append(text[:self.remaining])
        self.remaining = max(0, self.remaining - len(text))
        self.truncated = self.truncated or len(text) > 0 and self.remaining == 0
        return len(text)
    def getvalue(self):
        return ''.join(self.parts) + ('\n[Output limited to 2,000 characters.]' if self.truncated else '')


def neighbors_for(case):
    out = {i: [] for i in range(len(case['features']))}
    for a, b in case['edges']:
        out[a].append(b)
        out[b].append(a)
    return out


def expected_for(case, stage):
    """Independent edge-wise accumulation, not a student's node-wise loop."""
    result = [0.0] * len(case['features'])
    degrees = [0] * len(result)
    for a, b in case['edges']:
        result[a] += case['features'][b]
        result[b] += case['features'][a]
        degrees[a] += 1
        degrees[b] += 1
    if stage == 'mean':
        result = [x / n if n else 0.0 for x, n in zip(result, degrees)]
    elif stage == 'self':
        result = [x + y for x, y in zip(result, case['features'])]
    elif stage != 'sum':
        raise ValueError('Unknown aggregation rule.')
    return result


def validate_case(case):
    if not isinstance(case, dict) or not isinstance(case.get('features'), list) or len(case['features']) != 5:
        raise ValueError('This prototype needs five node features.')
    if any(isinstance(x, bool) or not isinstance(x, numbers.Real) or not math.isfinite(x) or abs(x) > 100 for x in case['features']):
        raise ValueError('Input features must be finite numbers between -100 and 100.')
    seen = set()
    for edge in case.get('edges', []):
        if not isinstance(edge, list) or len(edge) != 2 or any(type(x) is not int or not 0 <= x < 5 for x in edge) or edge[0] == edge[1]:
            raise ValueError('Invalid graph edge.')
        pair = tuple(sorted(edge))
        if pair in seen:
            raise ValueError('Duplicate graph edge.')
        seen.add(pair)
    if len(seen) > 10:
        raise ValueError('Too many graph edges.')


def student_location(exc, code):
    """Name the learner's line for runtime errors; SyntaxError already reports its own line."""
    if isinstance(exc, SyntaxError) or not isinstance(code, str):
        return ''
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == 'your_function.py']
    if not frames:
        return ''
    number = frames[-1].lineno
    lines = code.splitlines()
    source = lines[number - 1].strip() if 0 < number <= len(lines) else ''
    return f'Line {number}: {source[:200]}\n' if source else f'Line {number}\n'


def evaluate_submission(code, case, stage):
    validate_case(case)
    if not isinstance(code, str) or len(code) > 16000:
        raise ValueError('Code is limited to 16,000 characters.')
    expected = expected_for(case, stage)
    namespace = {'__name__': '__student__'}
    stdout = BoundedOutput()
    result = {'values': None, 'expected': expected, 'matches': [], 'passed': False,
              'mutated': False, 'error': None, 'stdout': '', 'returned': None}
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stdout):
            exec(compile(code, 'your_function.py', 'exec'), namespace)
            function = namespace.get('message_pass')
            if not callable(function):
                raise TypeError('Define message_pass(features, neighbors).')
            features = copy.deepcopy(case['features'])
            neighbors = neighbors_for(case)
            original = (copy.deepcopy(features), copy.deepcopy(neighbors))
            try:
                values = function(features, neighbors)
            finally:
                result['mutated'] = (features, neighbors) != original
            result['returned'] = reprlib.repr(values)[:500]
            if not isinstance(values, (list, tuple)) or len(values) != len(features):
                raise TypeError('Return a list of five numbers, one per node in node order.')
            if any(isinstance(x, bool) or not isinstance(x, numbers.Real) for x in values):
                raise TypeError('Every returned feature must be a number, not a Boolean or nested list.')
            values = [float(x) for x in values]
            if not all(math.isfinite(x) for x in values):
                raise ValueError('Returned features contain NaN or infinity; the graph needs finite numbers.')
            result['values'] = values
            result['matches'] = [math.isclose(x, y, rel_tol=1e-9, abs_tol=1e-9) for x, y in zip(values, expected)]
            result['passed'] = all(result['matches']) and not result['mutated']
    except BaseException as exc:
        error_text = ''.join(traceback.format_exception_only(type(exc), exc))
        error_text = student_location(exc, code) + error_text
        result['error'] = error_text[:1800] + ('\n[Error shortened.]' if len(error_text) > 1800 else '')
    result['stdout'] = stdout.getvalue()
    return result


REFERENCE_CODE = {
    'sum': "def message_pass(features, neighbors):\n    return [sum(features[j] for j in neighbors[i]) for i in range(len(features))]",
    'mean': "def message_pass(features, neighbors):\n    return [sum(features[j] for j in neighbors[i]) / len(neighbors[i]) if neighbors[i] else 0 for i in range(len(features))]",
    'self': "def message_pass(features, neighbors):\n    return [features[i] + sum(features[j] for j in neighbors[i]) for i in range(len(features))]",
}

def evaluate_request(request):
    if request.get('mode') == 'reference':
        # Never execute, inspect or depend on the learner's code in this path.
        return evaluate_submission(REFERENCE_CODE[request['stage']], request['case'], request['stage'])
    result = evaluate_submission(request['code'], request['case'], request['stage'])
    if request.get('suite'):
        result['suite'] = []
        for case in CASES:
            row = evaluate_submission(request['code'], case, request['stage'])
            result['suite'].append({'id': case['id'], 'name': case['name'], 'passed': row['passed'],
                                    'error': row['error'], 'mutated': row['mutated'],
                                    'values': row['values'], 'expected': row['expected']})
    return result
