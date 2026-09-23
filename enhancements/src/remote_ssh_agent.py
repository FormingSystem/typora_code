"""SSH标准输入上的有限文件协议；所有路径是JSON数据，不经过Shell解析。"""
import base64
import hashlib
import json
import os
import stat
import sys
import tempfile
import subprocess
import threading
import errno
import time
import signal
from concurrent.futures import ThreadPoolExecutor

MAX_BYTES = 16 * 1024 * 1024
file_handles = {}
handle_serial = 0
git_processes = {}
cancelled_git = set()
git_lock = threading.Lock()


def file_stat(value):
    return {"dev": str(value.st_dev), "ino": str(value.st_ino), "size": value.st_size,
            "mode": value.st_mode, "nlink": value.st_nlink, "mtimeMs": value.st_mtime_ns / 1000000,
            "ctimeMs": value.st_ctime_ns / 1000000,
            "directory": stat.S_ISDIR(value.st_mode), "file": stat.S_ISREG(value.st_mode),
            "link": stat.S_ISLNK(value.st_mode)}


def filesystem(request):
    """参数化文件系统端口；没有远程eval或任意方法调用。描述符仅由本连接持有。"""
    global handle_serial
    action = request.get("action")
    if action in {"read", "write", "fstat", "sync", "chmod", "close"}:
        descriptor = file_handles.get(request.get("handle"))
        if descriptor is None:
            raise ValueError("远程文件句柄已关闭")
        if action == "close":
            del file_handles[request["handle"]]
            os.close(descriptor)
            return None
        if action == "fstat":
            return file_stat(os.fstat(descriptor))
        if action == "sync":
            os.fsync(descriptor)
            return None
        if action == "chmod":
            os.fchmod(descriptor, int(request["mode"]) & 0o777)
            return None
        position = request.get("position")
        if position is not None:
            if not isinstance(position, int) or position < 0:
                raise ValueError("文件偏移无效")
            os.lseek(descriptor, position, os.SEEK_SET)
        if action == "read":
            length = request.get("length")
            if not isinstance(length, int) or not 0 <= length <= MAX_BYTES + 1:
                raise ValueError("读取长度无效")
            return base64.b64encode(os.read(descriptor, length)).decode("ascii")
        data = base64.b64decode(request.get("data", ""), validate=True)
        if len(data) > MAX_BYTES:
            raise ValueError("单次写入超过16 MiB")
        return os.write(descriptor, data)
    path = absolute_path(request.get("path"))
    if action in {"stat", "lstat"}:
        return file_stat(os.stat(path) if action == "stat" else os.lstat(path))
    if action == "watch_signature":
        digest = hashlib.sha256()
        values = [("", os.stat(path))]
        if stat.S_ISDIR(values[0][1].st_mode):
            with os.scandir(path) as entries:
                for entry in entries:
                    try:
                        values.append((entry.name, entry.stat(follow_symlinks=False)))
                    except FileNotFoundError:
                        continue
                    if len(values) > 10001:
                        raise ValueError("目录监视超过10000项，请手动刷新")
        for name, value in sorted(values, key=lambda item: item[0]):
            digest.update(json.dumps([name, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns]).encode("utf-8"))
        return digest.hexdigest()
    if action == "realpath":
        os.stat(path)
        return os.path.realpath(path)
    if action == "readlink":
        return os.readlink(path)
    if action == "trash":
        result = subprocess.run(["gio", "trash", "--", path], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if result.returncode or os.path.lexists(path):
            raise ValueError("远程回收站不可用，文件已保留；" + result.stderr[:4096].decode("utf-8", "replace"))
        return None
    if action == "open":
        flags = request.get("flags")
        if flags not in {"r", "wx"} or len(file_handles) >= 64:
            raise ValueError("远程打开模式无效或句柄已满")
        descriptor = os.open(path, (os.O_RDONLY | os.O_NONBLOCK) if flags == "r" else (os.O_WRONLY | os.O_CREAT | os.O_EXCL), int(request.get("mode", 0o666)) & 0o777)
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            os.close(descriptor)
            raise ValueError("只允许打开普通文件")
        handle_serial += 1
        file_handles[handle_serial] = descriptor
        return handle_serial
    if action == "rename":
        os.rename(path, absolute_path(request.get("target")))
    elif action == "link":
        os.link(path, absolute_path(request.get("target")))
    elif action == "unlink":
        os.unlink(path)
    elif action == "rmdir":
        os.rmdir(path)
    elif action == "mkdir":
        os.mkdir(path)
    else:
        raise ValueError("未支持的远程文件系统操作")
    return None


def run_git(request):
    args = request.get("args")
    if not isinstance(args, list) or not args or len(args) > 4096 or any(not isinstance(arg, str) or "\0" in arg for arg in args):
        raise ValueError("Git参数无效")
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    environment.update({"LC_ALL": "C", "LANG": "C", "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0"})
    for key in {"GIT_EDITOR", "GIT_SEQUENCE_EDITOR", "GIT_NO_LAZY_FETCH", "LINUX_NOTE_GIT_REBASE_TODO"}:
        value = request.get("env", {}).get(key)
        if isinstance(value, str) and "\0" not in value:
            environment[key] = value
    data = request.get("input")
    if data is not None and (not isinstance(data, str) or len(data.encode("utf-8")) > MAX_BYTES):
        raise ValueError("Git输入超过限制")
    # 临时输出避免管道死锁和无限内存增长；轮询只在独立Git线程运行。
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as error, tempfile.TemporaryFile() as input_file:
        if data:
            input_file.write(data.encode("utf-8"))
        input_file.seek(0)
        token = request.get("token", str(request["id"]))
        with git_lock:
            if token in cancelled_git:
                cancelled_git.discard(token)
                raise ValueError("远程Git已取消")
            child = subprocess.Popen(["git", *args], cwd=absolute_path(request.get("path")), env=environment,
                                     stdin=input_file, stdout=output, stderr=error, start_new_session=True)
            git_processes[token] = child
        try:
            deadline = time.monotonic() + (1800 if request.get("writable") else 300)
            while child.poll() is None:
                if time.monotonic() > deadline or os.fstat(output.fileno()).st_size > MAX_BYTES or os.fstat(error.fileno()).st_size > MAX_BYTES:
                    raise ValueError("远程Git超时（读取5分钟/写入30分钟）或输出超过16 MiB；文件连接仍可使用")
                time.sleep(0.02)
            if os.fstat(output.fileno()).st_size > MAX_BYTES:
                raise ValueError("远程Git输出超过16 MiB")
            output.seek(0)
            error.seek(0)
            if child.returncode:
                raise subprocess.CalledProcessError(child.returncode, "git", stderr=error.read(65536).decode("utf-8", "replace") or "远程Git已取消或执行失败")
            return {"data": base64.b64encode(output.read(MAX_BYTES)).decode("ascii")}
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            with git_lock:
                git_processes.pop(token, None)
                cancelled_git.discard(token)


def absolute_path(value):
    if not isinstance(value, str) or not os.path.isabs(value) or "\0" in value:
        raise ValueError("需要远程绝对路径")
    return os.path.normpath(value)


def snapshot(path):
    real_path = os.path.realpath(path)
    descriptor = os.open(real_path, os.O_RDONLY | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_BYTES:
            raise ValueError("仅支持16 MiB以内的普通文件")
        data = stream.read(MAX_BYTES + 1)
        after = os.fstat(stream.fileno())
    current = os.stat(real_path)
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mtime_ns, item.st_size)
    if len(data) > MAX_BYTES or identity(before) != identity(after) or identity(after) != identity(current) or real_path != os.path.realpath(path):
        raise ValueError("文件读取期间发生变化，请重新读取")
    version = {"sha256": hashlib.sha256(data).hexdigest(), "real_path": real_path,
               "identity": [str(value) for value in identity(after)]}
    return data, version, stat.S_IMODE(after.st_mode)


def perform(request):
    operation = request.get("operation")
    if operation == "hello":
        return {"protocol": 1, "home": os.path.expanduser("~"), "platform": sys.platform}
    if operation == "filesystem":
        return filesystem(request)
    if operation == "git":
        return run_git(request)
    if operation == "cancel_git":
        token = request.get("token")
        if not isinstance(token, str) or len(token) > 100:
            raise ValueError("Git取消标识无效")
        with git_lock:
            child = git_processes.get(token)
            if child and child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
            elif len(cancelled_git) < 1024:
                cancelled_git.add(token)
        return None
    path = absolute_path(request.get("path"))
    if operation == "list":
        entries = []
        with os.scandir(path) as directory:
            for item in directory:
                if len(entries) >= 10000:
                    raise ValueError("目录超过10000项，请打开更具体的项目目录")
                entries.append({"name": item.name, "directory": item.is_dir(), "link": item.is_symlink()})
        return {"path": os.path.realpath(path), "entries": sorted(entries, key=lambda item: (not item["directory"], item["name"].casefold()))}
    if operation == "read":
        data, version, _ = snapshot(path)
        return {"data": base64.b64encode(data).decode("ascii"), "version": version}
    if operation == "git_status":
        # 显式固定参数，不运行本机Git，也不拼接Shell；状态查询不获取可选写锁。
        environment = {key: value for key, value in os.environ.items() if key not in {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE"}}
        result = subprocess.run(["git", "--no-optional-locks", "-C", path, "status", "--short", "--branch", "--untracked-files=normal"],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, encoding="utf-8", errors="replace", env=environment)
        if result.returncode:
            raise ValueError(result.stderr[:4096].strip() or "远程Git状态查询失败")
        if len(result.stdout) > 2 * 1024 * 1024:
            raise ValueError("远程Git状态超过2 MiB，请在项目终端中查看")
        return {"path": path, "text": result.stdout}
    if operation == "write":
        original, version, mode = snapshot(path)
        if version != request.get("version"):
            raise ValueError("远程文件已被其他程序修改；未覆盖，请重新读取或另存为")
        data = base64.b64decode(request.get("data", ""), validate=True)
        if len(data) > MAX_BYTES:
            raise ValueError("保存内容超过16 MiB")
        real_path = version["real_path"]
        descriptor, temporary = tempfile.mkstemp(prefix=".typora-code-", dir=os.path.dirname(real_path))
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
                os.fchmod(stream.fileno(), mode)
            _, current, _ = snapshot(path)
            if current != version:
                raise ValueError("保存前远程文件发生变化；未覆盖")
            os.replace(temporary, real_path)
            temporary = None
            _, saved, _ = snapshot(path)
            if saved["sha256"] != hashlib.sha256(data).hexdigest():
                raise ValueError("保存后远程文件再次变化，请核对远程内容")
            return {"version": saved}
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)
    if operation == "create":
        data = base64.b64decode(request.get("data", ""), validate=True)
        if len(data) > MAX_BYTES:
            raise ValueError("内容超过16 MiB")
        with open(path, "xb") as stream:
            stream.write(data)
        return {"path": path}
    if operation == "mkdir":
        os.mkdir(path)
        return {"path": path}
    if operation == "remove":
        if request.get("version") is not None:
            _, current, _ = snapshot(path)
            if current != request["version"]:
                raise ValueError("删除前远程文件已变化；未删除，请重新读取")
        if os.path.isdir(path) and not os.path.islink(path):
            os.rmdir(path)
        else:
            os.unlink(path)
        return {"path": path}
    raise ValueError("未支持的远程操作")


def main():
    output_lock = threading.Lock()
    git_slot = threading.BoundedSemaphore(1)

    def respond(result):
        with output_lock:
            sys.stdout.write(json.dumps(result, ensure_ascii=True) + "\n")
            sys.stdout.flush()

    def execute(request, git=False):
        try:
            try:
                result = {"id": request["id"], "result": perform(request)}
            except Exception as error:
                result = {"id": request.get("id"), "error": getattr(error, "stderr", None) or str(error), "code": getattr(error, "returncode", None) or errno.errorcode.get(getattr(error, "errno", None))}
            respond(result)
        finally:
            if git:
                git_slot.release()

    # Git只读查询最多一个，不排无限队列；文件读写仍由主循环串行执行。
    # EOF时等待有15秒上限的查询退出，避免遗留工作线程。
    with ThreadPoolExecutor(max_workers=1) as executor:
        while True:
            line = sys.stdin.buffer.readline(24 * 1024 * 1024)
            if not line or not line.endswith(b"\n"):
                return
            try:
                request = json.loads(line)
                if not isinstance(request, dict):
                    raise ValueError("远程请求必须为对象")
            except Exception as error:
                respond({"id": None, "error": str(error)})
                continue
            if request.get("operation") in {"git_status", "git"}:
                if git_slot.acquire(blocking=False):
                    executor.submit(execute, request, True)
                else:
                    respond({"id": request.get("id"), "error": "远程Git正在查询，请稍后刷新；文件操作仍可使用"})
            else:
                execute(request)


if __name__ == "__main__":
    main()
