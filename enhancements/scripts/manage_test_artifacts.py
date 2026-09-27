"""测试载荷的唯一生命周期；只处理专属根中由本模块登记的目录。"""
from pathlib import Path
from contextlib import contextmanager
from functools import wraps
import argparse
import ctypes
import json
import os
import re
import shutil
import stat
import sys
import time
import uuid

REPOSITORY = Path(__file__).resolve().parents[2]
ROOTS = {"native": REPOSITORY / ".cache/issue_tracking/native",
         "test": REPOSITORY / ".cache/test_runs"}
PAYLOADS = {"native": ("host", "user_data", "appdata", "localappdata", "workspace", "corpus"),
            "test": ("work",)}
MARKER = "test_artifacts.json"


def process_identity(pid):
    """启动身份阻止PID复用；无法查询时保守认为进程仍存活。"""
    if os.name != "nt":
        try:
            return Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()[19]
        except FileNotFoundError:
            return None
        except OSError:
            return "unknown"
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    kernel.GetProcessTimes.argtypes = [ctypes.c_void_p] + [ctypes.c_void_p] * 4
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return None if ctypes.get_last_error() == 87 else "unknown"
    try:
        exit_code = ctypes.c_ulong()
        if kernel.GetExitCodeProcess(handle, ctypes.byref(exit_code)) and exit_code.value != 259:
            return None
        values = [ctypes.c_ulonglong() for _ in range(4)]
        if not kernel.GetProcessTimes(handle, *(ctypes.byref(value) for value in values)):
            return "unknown"
        return str(values[0].value)
    finally:
        kernel.CloseHandle(handle)


def linked(path):
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def load(directory):
    directory = Path(directory).absolute()
    kind = next((key for key, root in ROOTS.items() if directory.parent == root), None)
    if not kind or not re.fullmatch(r"[a-f0-9]{32}", directory.name):
        raise ValueError("目录不在测试产物根内")
    # 根和标记本身也不能经由junction转到用户目录。
    for parent in (directory, *directory.parents):
        if linked(parent):
            raise ValueError("测试目录不能经过链接")
        if parent == REPOSITORY:
            break
    marker = directory / MARKER
    if linked(marker):
        raise ValueError("测试标记不能是链接")
    data = json.loads(marker.read_text(encoding="utf-8"))
    if data.get("schema") != 1 or data.get("kind") != kind or data.get("id") != directory.name:
        raise ValueError("测试所有权标记不匹配")
    return directory, data


@contextmanager
def locked_directory(directory):
    # OS锁随进程退出释放，标记更新和清理互斥，不遗留无法恢复的锁租约。
    directory, _ = load(directory)
    lock_path = directory / "artifact.lock"
    if lock_path.exists() and linked(lock_path):
        raise ValueError("测试锁不能是链接")
    with lock_path.open("a+b") as handle:
        handle.seek(0, 2)
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def serialized(operation):
    @wraps(operation)
    def run(directory, *args, **kwargs):
        with locked_directory(directory):
            try:
                return operation(directory, *args, **kwargs)
            except (OSError, ValueError, RuntimeError) as error:
                if operation.__name__ == "finish":
                    root, data = load(directory)
                    data["cleanup_error"] = str(error)
                    save(root, data)
                raise
    return run


def remove_readonly(operation, path, error):
    # Git对象在Windows可能只读；只在已校验载荷内重试原删除操作。
    if linked(Path(path)):
        raise error[1]
    os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    operation(path)


def save(directory, data):
    temporary = directory / (MARKER + ".tmp")
    if temporary.exists() and linked(temporary):
        raise ValueError("测试标记临时文件不能是链接")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(directory / MARKER)


def create(kind, owner_pid, keep_json=False):
    for result in sweep(apply=True):
        if "error" in result:
            print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
    for parent in (ROOTS[kind], *ROOTS[kind].parents):
        if parent.exists() and linked(parent):
            raise ValueError("测试根不能经过链接")
        if parent == REPOSITORY:
            break
    directory = ROOTS[kind] / uuid.uuid4().hex
    directory.mkdir(parents=True)
    save(directory, {"schema": 1, "id": directory.name, "kind": kind, "created": time.time(),
                     "keep_json": keep_json, "state": "prepared", "owner_pid": owner_pid, "processes": {str(owner_pid): process_identity(owner_pid)}})
    if kind == "test":
        (directory / "work").mkdir()
    return directory


@serialized
def claim(directory, pid, child=False):
    directory, data = load(directory)
    if data.get("state") == "cleaned":
        raise ValueError("测试载荷已经回收")
    if not child:
        data["processes"].pop(str(data.get("owner_pid")), None)
        data["owner_pid"] = pid
    data["processes"][str(pid)] = process_identity(pid)
    data["state"] = "running"
    save(directory, data)


def active(data, ignore_pid=None):
    for pid, identity in data["processes"].items():
        if int(pid) == ignore_pid:
            continue
        current = process_identity(int(pid))
        if current is not None and (current == "unknown" or identity == "unknown" or current == identity):
            return True
    return False


@serialized
def finish(directory, status, owner_pid=None):
    directory, data = load(directory)
    if data.get("state") == "cleaned":
        return data
    if owner_pid is not None and data["processes"].get(str(owner_pid)) != process_identity(owner_pid):
        raise ValueError("只有登记的当前进程可结束测试")
    if active(data, owner_pid):
        raise RuntimeError("测试子进程仍在运行，暂不清理")
    data["result"] = status
    if os.environ.get("TYPORA_KEEP_TEST_WORK") == "1":
        data["state"] = "retained"
        save(directory, data)
        return data
    evidence = directory / "evidence"
    if evidence.exists():
        for folder, dirs, names in os.walk(evidence):
            if any(linked(entry) for entry in [Path(folder)] + [Path(folder) / name for name in dirs + names]):
                raise ValueError("证据目录不能包含链接")
    targets = [directory / name for name in PAYLOADS[data["kind"]] if (directory / name).exists()]
    # 全部边界先验证，再复制证据，最后删除。错误时保留载荷供复查。
    files = []
    for target in targets:
        for folder, dirs, names in os.walk(target):
            for entry in [Path(folder)] + [Path(folder) / name for name in dirs + names]:
                if linked(entry):
                    raise ValueError(f"测试载荷包含链接，保留现场：{entry}")
            files.extend(Path(folder) / name for name in names)
    reclaimed = sum(path.stat().st_size for path in files)
    for source in files:
        if source.suffix.lower() in (".log", ".png") or source.name in ("checks.json", "result.json", "setup.json", "failure.html") or (data.get("keep_json") and source.suffix.lower() == ".json"):
            target = evidence / source.relative_to(directory)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    for target in targets:
        # 重查最终目标，禁止根目录或外部路径删除。
        if target.parent != directory or target.name not in PAYLOADS[data["kind"]] or linked(target):
            raise ValueError("清理目标发生变化")
        for attempt in range(5):
            try:
                shutil.rmtree(target, onerror=remove_readonly)
                break
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.2 * (attempt + 1))
    data.pop("cleanup_error", None)
    data.update(state="cleaned", finished=time.time(), payload_bytes=reclaimed)
    save(directory, data)
    return data


def sweep(apply=False):
    results = []
    for root in ROOTS.values():
        if not root.exists():
            continue
        for directory in root.iterdir():
            if not directory.is_dir() or not (directory / MARKER).is_file():
                continue
            try:
                directory, data = load(directory)
                if data.get("state") == "cleaned" or time.time() - data["created"] < 86400 or active(data):
                    continue
                results.append({"directory": str(directory), "action": "reclaim"})
                if apply:
                    finish(directory, "abandoned")
            except (OSError, ValueError, RuntimeError) as error:
                results.append({"directory": str(directory), "error": str(error)})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["create", "claim", "finish", "sweep"])
    parser.add_argument("directory", nargs="?")
    parser.add_argument("--kind", choices=ROOTS, default="test")
    parser.add_argument("--pid", type=int, default=os.getppid())
    parser.add_argument("--child", action="store_true")
    parser.add_argument("--keep-json", action="store_true")
    parser.add_argument("--status", default="finished")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.action == "create":
        print(create(args.kind, args.pid, args.keep_json))
    elif args.action == "claim":
        claim(args.directory, args.pid, args.child)
    elif args.action == "finish":
        print(json.dumps(finish(args.directory, args.status, args.pid), ensure_ascii=False))
    else:
        print(json.dumps(sweep(args.apply), ensure_ascii=False, indent=2))
