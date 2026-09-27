"""为整套非UI检查提供专属临时目录、输出留存和最终回收。"""
from pathlib import Path
import os
import subprocess
import sys

from manage_test_artifacts import claim, create, finish


def main():
    directory = create("test", os.getpid(), keep_json=True)
    evidence = directory / "evidence"
    evidence.mkdir()
    environment = dict(os.environ, TEMP=str(directory / "work"), TMP=str(directory / "work"), TMPDIR=str(directory / "work"))
    environment["GIT_CEILING_DIRECTORIES"] = os.pathsep.join(filter(None, [environment.get("GIT_CEILING_DIRECTORIES"), str(directory)]))
    arguments = sys.argv[1:]
    if not arguments:
        raise ValueError("缺少测试命令")
    if os.name == "nt" and arguments[0] == "npm":
        arguments = [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", *arguments]
    child = None
    exit_code = 1
    try:
        with (evidence / "output.log").open("wb") as log:
            child = subprocess.Popen(arguments, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            claim(directory, child.pid, child=True)
            while chunk := child.stdout.read1(65536):
                log.write(chunk)
                log.flush()
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
            exit_code = child.wait()
    finally:
        if child and child.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                child.terminate()
            child.wait()
        try:
            finish(directory, "passed" if exit_code == 0 else "failed", os.getpid())
        except (OSError, RuntimeError, ValueError) as error:
            print(f"测试载荷清理失败，现场保留：{error}", file=sys.stderr)
            exit_code = exit_code or 1
        print(f"Evidence: {evidence}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
