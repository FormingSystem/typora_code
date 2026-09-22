"""真实协议进程验证：慢Git不能排在文件操作之前，Git并发有界。"""
import base64
import json
import pathlib
import queue
import subprocess
import sys
import tempfile
import threading


def run():
    with tempfile.TemporaryDirectory(prefix="typora-ssh-agent-") as scratch:
        root = pathlib.Path(scratch)
        agent = pathlib.Path(__file__).resolve().parents[1] / "src" / "remote_ssh_agent.py"
        # 只替换Git耗时边界，stdin/stdout、调度及文件读写均运行产品代码。
        harness = """
import importlib.util,pathlib,time,sys,os
spec=importlib.util.spec_from_file_location('agent',sys.argv[1]); agent=importlib.util.module_from_spec(spec); spec.loader.exec_module(agent)
# Windows协议夹具补POSIX文件标志；权限语义另由Linux真实SSH验收。
if os.name=='nt':
    os.O_NONBLOCK=0
    os.fchmod=lambda descriptor,mode: None
root=pathlib.Path(sys.argv[2]); original=agent.perform
def perform(request):
    if request.get('operation')=='git_status' and request['path']==str(root):
        (root/'started').touch()
        limit=time.monotonic()+15
        while not (root/'release').exists():
            if time.monotonic()>limit: raise RuntimeError('fixture timeout')
            time.sleep(.01)
        return {'path':str(root),'text':'## fixture'}
    return original(request)
agent.perform=perform; agent.main()
"""
        child = subprocess.Popen([sys.executable, "-u", "-c", harness, str(agent), str(root)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
        replies = queue.Queue()
        def read():
            for line in child.stdout:
                replies.put(json.loads(line))
        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        def send(serial, operation, **values):
            child.stdin.write(json.dumps(dict(id=serial, operation=operation, **values)) + "\n")
            child.stdin.flush()
        def receive(serial):
            result = replies.get(timeout=25)
            assert result['id'] == serial, result
            return result
        try:
            send(1, "git_status", path=str(root))
            import time
            limit = time.monotonic() + 5
            while not (root / 'started').exists():
                assert time.monotonic() < limit, 'Git worker did not start'
                time.sleep(.01)
            send(2, "git_status", path=str(root))
            assert '正在查询' in receive(2)['error']
            file = str(root / '中文.md')
            send(3, 'create', path=file, data='')
            assert 'result' in receive(3)
            for index in range(100):
                send(4, 'read', path=file)
                result = receive(4)
                assert 'result' in result, result
                version = result['result']['version']
                data = base64.b64encode(('正文 ' + str(index)).encode()).decode()
                send(5, 'write', path=file, version=version, data=data)
                result = receive(5)
                assert 'result' in result, result
                send(6, 'read', path=file)
                assert receive(6)['result']['data'] == data
            send(7, 'list', path=str(root))
            assert any(item['name'] == '中文.md' for item in receive(7)['result']['entries'])
            (root / 'release').touch()
            assert receive(1)['result']['text'] == '## fixture'
            # 同一协议进程继续处理真实Git；非仓失败不破坏下一次空仓/嵌套仓查询。
            plain = root / 'plain'; plain.mkdir()
            send(8, 'git_status', path=str(plain))
            assert 'error' in receive(8)
            for name in ['repo', 'repo/nested']:
                repo = root / name; repo.mkdir(parents=True, exist_ok=True)
                subprocess.run(['git', 'init', '-q', str(repo)], check=True)
                (repo / 'new.txt').write_text('new', encoding='utf-8')
                send(9, 'git_status', path=str(repo))
                assert 'new.txt' in receive(9)['result']['text']
            child.stdin.close()
            assert child.wait(timeout=10) == 0, child.stderr.read()
            print('PASS: slow Git isolation; 100 read/write cycles; bounded Git; non-repository, empty and nested Git')
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()


if __name__ == '__main__':
    run()
