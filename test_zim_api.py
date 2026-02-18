#!/usr/bin/env python3
"""Probe libzim API to find safe iteration method."""
import sys, os

OUT = os.path.join(os.path.dirname(__file__), 'zim_api_probe.txt')

def log(msg):
    with open(OUT, 'a') as f:
        f.write(msg + '\n')
        f.flush()

# Clear old output
with open(OUT, 'w') as f:
    f.write('')

log('step1: importing libzim')
try:
    from libzim.reader import Archive
    log('step2: import ok')
except Exception as e:
    log(f'import failed: {e}')
    sys.exit(1)

ZIM = '/home/sbussiso/Desktop/zim file tests/wikipedia_en_100_maxi_2026-01.zim'
log(f'step3: opening {ZIM}')
try:
    a = Archive(ZIM)
    log(f'step4: archive opened, entry_count={a.entry_count}')
except Exception as e:
    log(f'open failed: {e}')
    sys.exit(1)

# List public attributes
attrs = [m for m in dir(a) if not m.startswith('__')]
log(f'step5: attrs={attrs}')

# Test iteration
log('step6: testing iter()')
try:
    it = iter(a)
    first = next(it)
    log(f'step7: iterable, first={first}')
except TypeError as e:
    log(f'step7: NOT iterable: {e}')
except StopIteration:
    log('step7: iterable but empty')
except Exception as e:
    log(f'step7: iter error: {e}')

# Test _get_entry_by_id
log('step8: testing _get_entry_by_id(0)')
try:
    e0 = a._get_entry_by_id(0)
    log(f'step9: entry0 path={e0.path} is_redirect={e0.is_redirect}')
except Exception as e:
    log(f'step9: _get_entry_by_id error: {e}')

# Test has_entry_by_path
log('step10: testing get_entry_by_path')
try:
    # Try to get the main page
    mp = a.main_entry
    log(f'step11: main_entry path={mp.path}')
except Exception as e:
    log(f'step11: main_entry error: {e}')

log('DONE')
