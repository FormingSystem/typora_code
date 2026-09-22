"""SSH标准输入上的有限文件协议；所有路径是JSON数据，不经过Shell解析。"""
import base64
import hashlib
import json
import os
import stat
import sys
import tempfile

MAX_BYTES = 16 * 1024 * 1024


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
    while True:
        line = sys.stdin.buffer.readline(24 * 1024 * 1024)
        if not line:
            return
        if not line.endswith(b"\n"):
            return
        request = {}
        try:
            request = json.loads(line)
            result = {"id": request["id"], "result": perform(request)}
        except Exception as error:
            result = {"id": request.get("id"), "error": str(error)}
        sys.stdout.write(json.dumps(result, ensure_ascii=True) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
