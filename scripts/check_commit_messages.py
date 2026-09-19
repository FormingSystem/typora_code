"""检查本仓库提交的中文标题和逐行明细；只读，不修改消息或引用。"""

import argparse
from pathlib import Path
import re
import subprocess
import sys


REPOSITORY = Path(__file__).resolve().parents[1]
TITLE = re.compile(r"^(feat|fix|refactor|perf|security|content|docs|test|build|ci|release|revert|chore)(\([^\r\n()]+\))?!?: .+$")


def message_errors(message):
    lines = message.strip("\r\n").splitlines()
    errors = []
    if not lines or not TITLE.fullmatch(lines[0]) or not re.search(r"[\u3400-\u9fff]", lines[0]):
        errors.append("标题必须是包含中文结果的Conventional Commit")
    if len(lines) < 3 or lines[1].strip():
        errors.append("标题后必须空一行并提供正文")
    details = [line for line in lines[2:] if line.strip()]
    if not details or any(not line.startswith("- ") or not line[2:].strip() for line in details):
        errors.append("正文每条明细必须独立一行，以'- '开头且有具体内容")
    return errors


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPOSITORY).decode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--all", action="store_true", help="检查所有本地分支可达提交")
    mode.add_argument("--message-file", type=Path, help="检查准备提交的UTF-8消息文件")
    args = parser.parse_args()
    failures = 0
    count = 0
    try:
        entries = [(str(args.message_file), args.message_file.read_text(encoding="utf-8-sig"))] if args.message_file else (
            (oid, git("show", "-s", "--format=%B", oid))
            for oid in git("rev-list", "--branches").splitlines()
        )
        for identity, message in entries:
            count += 1
            errors = message_errors(message)
            if errors:
                failures += 1
                print(f"FAIL {identity}: {'; '.join(errors)}")
    except (OSError, UnicodeError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    print(f"{'FAIL' if failures else 'PASS'}: {count} checked, {failures} invalid")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
