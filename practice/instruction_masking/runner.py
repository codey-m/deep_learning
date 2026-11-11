"""Formative instruction-masking runner; also executable under CPython for tests."""
import contextlib
import copy
import io
import json
import math
import numbers
import reprlib
import traceback

ROLES = ('system', 'user', 'assistant')

# Disclosed formative cases. The first is the notebook's conversation. None reproduces
# the role sequence of the paired course check (M5_U5_CYU3).
CASES = [
    {'id': 'notebook', 'name': 'Two-turn conversation',
     'roles': ['system', 'system', 'user', 'user', 'user', 'assistant', 'assistant', 'user', 'user', 'assistant', 'assistant'],
     'losses': [0.9, 0.7, 1.7, 1.4, 1.5, 0.9, 0.7, 1.6, 1.3, 0.8, 0.6]},
    {'id': 'one-token-replies', 'name': 'One-token replies',
     'roles': ['system', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant'],
     'losses': [1.1, 1.8, 0.5, 1.6, 0.4, 1.9, 0.7]},
    {'id': 'ends-with-user', 'name': 'Ends on the user’s turn',
     'roles': ['system', 'system', 'user', 'assistant', 'assistant', 'user', 'user', 'user'],
     'losses': [0.8, 0.6, 1.5, 0.9, 0.5, 1.7, 1.2, 1.4]},
    {'id': 'assistant-first', 'name': 'Assistant speaks first',
     'roles': ['assistant', 'assistant', 'user', 'user', 'assistant', 'assistant', 'assistant'],
     'losses': [0.6, 0.5, 1.6, 1.3, 0.8, 0.7, 0.4]},
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


def describe_error(exc, code):
    text = student_location(exc, code) + ''.join(traceback.format_exception_only(type(exc), exc))
    return text[:1800] + ('\n[Error shortened.]' if len(text) > 1800 else '')


def validate_case(case):
    if not isinstance(case, dict):
        raise ValueError('Invalid conversation.')
    roles, losses = case.get('roles'), case.get('losses')
    if not isinstance(roles, list) or not isinstance(losses, list) or len(roles) != len(losses) or not 2 <= len(roles) <= 12:
        raise ValueError('A conversation needs 2 to 12 tokens, each with a role and a loss.')
    if any(r not in ROLES for r in roles):
        raise ValueError('Unknown role.')
    if any(isinstance(x, bool) or not isinstance(x, numbers.Real) or not math.isfinite(x) or not 0 <= x <= 20 for x in losses):
        raise ValueError('Losses must be finite numbers between 0 and 20.')


def expected_for(case):
    """Independent calculation: target i is token i + 1; supervise it when that token is the assistant's."""
    roles, losses = case['roles'], case['losses']
    mask = [0] * (len(roles) - 1)
    for position in range(1, len(roles)):
        if roles[position] == 'assistant':
            mask[position - 1] = 1
    selected = [losses[i + 1] for i in range(len(mask)) if mask[i]]
    mean = sum(selected) / len(selected) if selected else None
    return mask, mean


def own_role_mask(case):
    """The notebook's comparison mask: each position's own role, last entry dropped."""
    return [1 if role == 'assistant' else 0 for role in case['roles']][:-1]


def normalise_mask(values, length):
    if not isinstance(values, (list, tuple)):
        raise TypeError(f'target_mask must return a list of 0/1 values, one per target ({length}).')
    if len(values) != length:
        raise ValueError(f'target_mask returned {len(values)} entries; this conversation has {length} targets '
                         f'(one per token except the last).')
    out = []
    for value in values:
        if isinstance(value, bool):
            out.append(int(value))
        elif isinstance(value, numbers.Real) and value in (0, 1):
            out.append(int(value))
        else:
            raise TypeError('Every mask entry must be 0 or 1 (True or False also works).')
    return out


def check_mean(value):
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        raise TypeError('supervised_mean_nll must return a number.')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('supervised_mean_nll returned NaN or infinity.')
    return value


def close(a, b):
    return a is not None and b is not None and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)


def evaluate_submission(code, case):
    validate_case(case)
    if not isinstance(code, str) or len(code) > 16000:
        raise ValueError('Code is limited to 16,000 characters.')
    expected_mask, expected_mean = expected_for(case)
    targets_expected = case['losses'][1:]
    result = {'mask': None, 'mask_error': None, 'mask_matches': [], 'mask_ok': False,
              'mean_own': None, 'mean_own_error': None, 'mean_ok': False, 'mean_error': None,
              'toy_ok': False, 'mutated': False, 'error': None, 'stdout': '', 'returned_mask': None,
              'expected_mask': expected_mask, 'expected_mean': expected_mean, 'passed': False}
    namespace = {'__name__': '__student__'}
    stdout = BoundedOutput()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stdout):
        try:
            exec(compile(code, 'your_function.py', 'exec'), namespace)
        except BaseException as exc:
            result['error'] = describe_error(exc, code)
        if result['error'] is None:
            mask_fn, mean_fn = namespace.get('target_mask'), namespace.get('supervised_mean_nll')
            # 1. The mask, from the learner's function on copies of the roles.
            if not callable(mask_fn):
                result['mask_error'] = 'Define target_mask(roles, supervised_role="assistant").'
            else:
                roles = copy.deepcopy(case['roles'])
                try:
                    returned = mask_fn(roles)
                    result['returned_mask'] = reprlib.repr(returned)[:500]
                    result['mask'] = normalise_mask(returned, len(case['roles']) - 1)
                except BaseException as exc:
                    result['mask_error'] = describe_error(exc, code)
                finally:
                    result['mutated'] = result['mutated'] or roles != case['roles']
            # 2. The averaging function, checked on the rule's selection so a mask error cannot hide it.
            if not callable(mean_fn):
                result['mean_error'] = 'Define supervised_mean_nll(losses, mask).'
            else:
                targets, mask_copy = copy.deepcopy(targets_expected), list(expected_mask)
                try:
                    value = check_mean(mean_fn(targets, mask_copy))
                    toy = [check_mean(mean_fn([2.0, 4.0], [1, 1])), check_mean(mean_fn([2.0, 4.0], [0, 1]))]
                    result['toy_ok'] = close(toy[0], 3.0) and close(toy[1], 4.0)
                    result['mean_ok'] = close(value, expected_mean) and result['toy_ok']
                except BaseException as exc:
                    result['mean_error'] = describe_error(exc, code)
                finally:
                    result['mutated'] = result['mutated'] or targets != targets_expected or mask_copy != expected_mask
                # 3. The learner's mean on the learner's own mask, for the displayed report.
                if result['mask'] is not None and result['mean_error'] is None:
                    targets = copy.deepcopy(targets_expected)
                    try:
                        result['mean_own'] = check_mean(mean_fn(targets, list(result['mask'])))
                    except BaseException as exc:
                        result['mean_own_error'] = describe_error(exc, code)
                    finally:
                        result['mutated'] = result['mutated'] or targets != targets_expected
    if result['mask'] is not None:
        result['mask_matches'] = [a == b for a, b in zip(result['mask'], expected_mask)]
        result['mask_ok'] = all(result['mask_matches'])
    result['passed'] = result['mask_ok'] and result['mean_ok'] and not result['mutated']
    result['stdout'] = stdout.getvalue()
    return result


REFERENCE_CODE = '''def target_mask(roles, supervised_role="assistant"):
    return [1 if role == supervised_role else 0 for role in roles[1:]]

def supervised_mean_nll(losses, mask):
    kept = [loss for loss, keep in zip(losses, mask) if keep]
    return sum(kept) / len(kept)
'''


def evaluate_request(request):
    if request.get('mode') == 'reference':
        # Never execute, inspect or depend on the learner's code in this path.
        return evaluate_submission(REFERENCE_CODE, request['case'])
    result = evaluate_submission(request['code'], request['case'])
    if request.get('suite'):
        result['suite'] = []
        for case in CASES:
            row = evaluate_submission(request['code'], case)
            wrong = sum(1 for ok in row['mask_matches'] if not ok) if row['mask'] is not None else None
            result['suite'].append({'id': case['id'], 'name': case['name'], 'passed': row['passed'],
                                    'mask_ok': row['mask_ok'], 'mean_ok': row['mean_ok'], 'mask_wrong': wrong,
                                    'error': row['error'] or row['mask_error'] or row['mean_error'],
                                    'mutated': row['mutated']})
    return result
