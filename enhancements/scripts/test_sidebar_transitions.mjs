import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
// 直接执行生产 Sidebar 类，仅替换依赖的宿主端口；不复制切换算法。
const source=fs.readFileSync('vendor/workspace_core/src/ui/sidebar/sidebar.ts','utf8').replace(/^import .*\r?\n/gm,'');
const compiled=await transform(source,{loader:'ts',format:'cjs'});
const calls=[];let visible=true;const mounted=new Set();
const container={parentElement:{},append(node){mounted.add(node)},};
const context={exports:{},setTimeout:callback=>callback(),document:{getElementById:()=>container},View:class{},ViewLegacy:class{},Component:class{addChild(){}},useService:()=>({addButton(){},removeButton(){}}),editor:{library:{isSidebarShown:()=>visible,showSidebar(){visible=true;calls.push('open')},hideSidebar(){visible=false;calls.push('close')}}}};
context.module={exports:context.exports};
vm.runInNewContext(compiled.code,context);
const {Sidebar}=context.module.exports,sidebar=new Sidebar(()=>[]);
function panel_class(name){return class{shows=0;hides=0;show(){this.shows++;mounted.add(name)}hide(){this.hides++;mounted.delete(name)}};}
const First=panel_class('first'),Second=panel_class('second'),Unknown=panel_class('unknown');
const first=new First(),second=new Second();sidebar.addPanel(first);sidebar.addPanel(second);
sidebar.switch(First);assert.equal(first.shows,1);assert.deepEqual(calls,[]);
sidebar.show();sidebar.show();assert.equal(first.shows,1,'重复show不重建面板及其订阅');
sidebar.switch(Unknown);assert.equal(sidebar.activePanel,first);assert.equal(mounted.size,1);
const count=Number(process.env.TYPORA_STRESS_ITERATIONS||20),start=performance.now();
for(let i=0;i<count;i++){sidebar.switch(i%2?First:Second);assert.equal(mounted.size,1);assert.equal(visible,true);}
assert.deepEqual(calls,[],'可见面板切换不能关闭或重新打开宿主侧栏');
assert.equal(first.shows+second.shows,count+1,'每次真实切换只挂载一次');
sidebar.hide();sidebar.hide();assert.deepEqual(calls,['close']);assert.equal(mounted.size,0);
sidebar.show();sidebar.show();assert.deepEqual(calls,['close','open']);assert.equal(mounted.size,1);
sidebar.switch(sidebar.activePanel.constructor);assert.equal(visible,false,'同一活动按钮仍能收起');
sidebar.switch(Second);if(!visible)sidebar.show();assert.equal(visible,true);
sidebar.removePanel(second);assert.equal(sidebar.activePanel,undefined);assert.equal(mounted.size,0,'移除活动面板不残留展示所有者');
console.log(JSON.stringify({status:'PASS',count,elapsed_ms:performance.now()-start,shows:first.shows+second.shows,checks:['unknown target','idempotent show/hide','one panel','no host close/open on switch','same-panel toggle']}));
