// 只操作本次创建的临时目录，回收站回调也重定向到同一临时树。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
const bundle = await build({entryPoints:[fileURLToPath(new URL("../src/workspace_file_operations.ts",import.meta.url))],bundle:true,platform:"node",format:"esm",write:false});
const {create_workspace_entry:create,transfer_workspace_entries:transfer,trash_workspace_entries:trash}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"typora_file_operations_")),root=path.join(temporary,"root"),recycle=path.join(temporary,"recycle");fs.mkdirSync(root);fs.mkdirSync(recycle);
const modules={fs,path_api:path};
try {
  await create(modules,root,root,"source",true);await create(modules,root,root,"target",true);await create(modules,root,root,"empty.txt",false);
  await assert.rejects(create(modules,root,root,"empty.txt",false));await assert.rejects(create(modules,root,root,"../escape",false));await assert.rejects(create(modules,root,temporary,"escape",false));
  const source=path.join(root,"source"),target=path.join(root,"target");fs.writeFileSync(path.join(source,"a.txt"),"content α");fs.mkdirSync(path.join(source,"nested"));fs.writeFileSync(path.join(source,"nested","b.bin"),Buffer.from([0,1,255]));
  await transfer(modules,root,[source],target);assert.equal(fs.readFileSync(path.join(target,"source","a.txt"),"utf8"),"content α");assert.deepEqual(fs.readFileSync(path.join(target,"source","nested","b.bin")),Buffer.from([0,1,255]));
  await assert.rejects(transfer(modules,root,[source],target),/同名/);await assert.rejects(transfer(modules,root,[source],source),/自身/);await assert.rejects(transfer(modules,root,[root],target));
  const failure=path.join(root,"failure");fs.mkdirSync(failure);
  const faulty={...fs,promises:{...fs.promises,open:async(file,flags)=>{if(file===path.join(source,"nested","b.bin")&&flags==="r")throw new Error("injected read failure");return fs.promises.open(file,flags)}}};
  await assert.rejects(transfer({fs:faulty,path_api:path},root,[source],failure),/injected/);assert.deepEqual(fs.readdirSync(failure),[],"failed recursive copy removes only entries it created");assert(fs.existsSync(source));
  const retained=path.join(root,"retained");fs.mkdirSync(retained);
  const concurrent={...fs,promises:{...fs.promises,open:async(file,flags)=>{if(file===path.join(source,"nested","b.bin")&&flags==="r"){fs.writeFileSync(path.join(retained,"source","external.txt"),"another writer");throw new Error("injected concurrent failure")}return fs.promises.open(file,flags)}}};
  await assert.rejects(transfer({fs:concurrent,path_api:path},root,[source],retained),error=>error.remaining_paths.includes(path.join(retained,"source")));assert.equal(fs.readFileSync(path.join(retained,"source","external.txt"),"utf8"),"another writer");
  let move_count=0;const move=async(_root,from,to)=>{move_count++;if(from===path.join(root,"empty.txt"))throw new Error("injected move failure");await fs.promises.rename(from,to);return to};
  await assert.rejects(transfer(modules,root,[source,path.join(root,"empty.txt")],failure,move),/injected move/);assert.equal(move_count,3);assert(fs.existsSync(source));assert.deepEqual(fs.readdirSync(failure),[]);
  let trash_count=0;await assert.rejects(trash(modules,root,[path.join(root,"empty.txt"),source],async file=>{if(++trash_count===2)throw new Error("injected recycle failure");await fs.promises.rename(file,path.join(recycle,path.basename(file)))}),error=>error.trashed_paths.length===1);assert(fs.existsSync(path.join(recycle,"empty.txt")));assert(fs.existsSync(source));
  await assert.rejects(trash(modules,root,[root],async()=>assert.fail("root never reaches recycle")));
  const link=path.join(root,"link");let link_supported=true;try{fs.symlinkSync(source,link,process.platform==="win32"?"junction":"dir")}catch{link_supported=false}
  if(link_supported){await assert.rejects(create(modules,root,link,"escape.txt",false),/符号链接/);await assert.rejects(transfer(modules,root,[link],failure),/符号链接/);}
  console.log(JSON.stringify({status:"PASS",checks:["exclusive creation and workspace boundary","recursive binary copy","collision preserves target","copy into self rejected","copy failure rollback","concurrent external file retained during rollback","move callback and batch rollback","recycle partial completion report","root protection","symlink rejection"],link_supported}));
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
