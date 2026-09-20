// 验证公开设置/命令/状态栏ABI；只在独立测试副本安装。
const {Plugin,PluginSettings,SettingTab}=window[Symbol.for('typora-plugin-core@v2')];
class Settings extends SettingTab {
 constructor(plugin){super();this.plugin=plugin;}
 get name(){return '公共设置API';}
 onshow(){this.containerEl.replaceChildren();this.addSetting(item=>{item.addName('测试文本');item.addText(input=>{input.value=this.plugin.settings.get('message');input.onchange=()=>this.plugin.settings.set('message',input.value);});});}
}
export default class Fixture extends Plugin {
 constructor(...args){super(...args);if(window.fixture_constructor_failure){const node=this.addStatusBarItem({position:'right'});node.dataset.fixtureConstructorFailure='yes';throw Error('预期构造失败');}}
 onload(){
  this.registerSettings(new PluginSettings(this.app,this.manifest,{version:1}));this.settings.setDefault({message:'初始值'});
  this.registerSettingTab(new Settings(this));
  const node=this.addStatusBarItem({position:'right',type:'item',hint:'插件测试'});node.dataset.communityFixture='ready';node.textContent='API';
  this.registerCommand({id:'sample',title:'测试命令',scope:'global',callback:()=>{node.textContent='已执行';}});
 }
}
