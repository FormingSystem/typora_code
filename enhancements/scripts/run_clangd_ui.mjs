import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import path from "node:path";

const require=createRequire(import.meta.url),environment={...process.env};
delete environment.ELECTRON_RUN_AS_NODE;
const child=spawn(require("electron"),[path.join(import.meta.dirname,"test_workspace_clangd_outline.cjs")],{cwd:path.resolve(import.meta.dirname,".."),env:environment,stdio:"inherit",windowsHide:true});
const timeout=setTimeout(()=>{console.error("clangd UI 验证超过180秒。");child.kill();},180000);
child.once("error",error=>{clearTimeout(timeout);console.error(error);process.exitCode=1;});
child.once("exit",code=>{clearTimeout(timeout);process.exitCode=code??1;});
