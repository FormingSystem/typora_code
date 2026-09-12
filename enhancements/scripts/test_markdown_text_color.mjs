import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/markdown_text_color.ts'],bundle:true,platform:'node',format:'esm',write:false});
const color=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const checks=[];
assert.equal(color.normalize_text_color('#FF0088'),'ff0088');
for(const value of ['red','#123','12345678','var(--x)','ffffff;display:none','<script>'])assert.throws(()=>color.normalize_text_color(value));
checks.push('custom colors accept only six hexadecimal digits');
for(const [,value]of color.text_color_presets)assert.equal(color.read_text_color_open(color.text_color_open(value)),value);
for(const html of ['<span style="color:red">','<span style="color:var(--typora-code-color-ff0000, #00ff00)">','<span class="red">'])assert.equal(color.read_text_color_open(html),undefined);
checks.push('only owned canonical color markup can be removed or rewritten');
const rgb=value=>value.replace('#','').match(/../g).map(x=>parseInt(x,16));
for(const background of [[255,255,255],[54,59,64],[30,30,30],[0,0,0],[128,128,128],[255,245,220],[54,80,110]]){
 for(const value of [...color.text_color_presets.map(x=>x[1]),'ffffff','000000','ff0000','00ff00','0000ff','778899']){
  const adjusted=color.adaptive_text_color(value,background);
  assert(color.color_contrast(rgb(adjusted),background)>=4.5,`${value} on ${background}: ${adjusted}`);
  if(color.color_contrast(rgb(value),background)>=4.5)assert.equal(adjusted,'#'+value);
 }
}
const night=rgb(color.adaptive_text_color('b42318',[54,59,64]));assert(night[0]>night[1]&&night[1]>night[2]);
checks.push('all presets and custom extremes reach 4.5 contrast on light, dark, midtone and tinted backgrounds without hue inversion');
const source='**中文🙂 text** [link](https://example.org/a?b=c)';
const start=source.indexOf('中文'),end=start+'中文🙂'.length;
const result=color.rewrite_text_colors(source,[{start,end,color:'b42318'}],[],{start,end});
assert.equal(result.text,'**'+color.text_color_open('b42318')+'中文🙂</span> text** [link](https://example.org/a?b=c)');
assert.equal(result.text.slice(result.selection.start,result.selection.end),'中文🙂');
const open=color.text_color_open('b42318'),encoded=open+'abcdef</span>';
const changed=color.rewrite_text_colors(encoded,[{start:open.length,end:open.length+2,color:'b42318'},{start:open.length+2,end:open.length+4},{start:open.length+4,end:open.length+6,color:'b42318'}],[{start:0,end:open.length},{start:open.length+6,end:encoded.length}],{start:open.length+2,end:open.length+4});
assert.equal(changed.text,open+'ab</span>cd'+open+'ef</span>');
assert.equal(changed.text.slice(changed.selection.start,changed.selection.end),'cd');
assert.throws(()=>color.rewrite_text_colors('abc',[{start:0,end:2},{start:1,end:3}],[]));
assert.throws(()=>color.rewrite_text_colors('abc',[{start:0,end:4}],[]));
checks.push('partial color reset preserves neighbors, UTF-16 selection, Markdown syntax and link destinations; stale ranges are rejected');
console.log(JSON.stringify({status:'PASS',checks}));
