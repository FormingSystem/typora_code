// 原始 Typora 隔离副本：实际顶栏/公共菜单及核心 Menu 的语义和文字几何。
(async()=>{
  const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const escape=()=>{for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true,cancelable:true}));};
  try{
    const app=window[Symbol.for('typora-code:workspace')].app;
    const original=fs.readFileSync(path.join(base,'workspace/front.md'),'utf8');
    await pause(1800);
    const inspect=(menu,label_class,check_class,scope)=>{
      const rows=[...menu.querySelectorAll(':scope > button,:scope > li > a')];
      assert(rows.length>0,scope+' 有实际菜单项');
      const metrics=rows.map(row=>{
        const label=row.querySelector(label_class),slot=row.querySelector(check_class),style=getComputedStyle(row);
        const inset=label.getBoundingClientRect().left-row.getBoundingClientRect().left;
        return {title:label.textContent,role:row.getAttribute('role'),checked:row.getAttribute('aria-checked'),slot:!!slot,inset,padding:parseFloat(style.paddingLeft),glyph:!!slot?.firstElementChild};
      });
      assert(metrics.every(row=>row.slot===(row.role==='menuitemcheckbox')),scope+' 仅勾选能力分配状态槽');
      assert(metrics.filter(row=>!row.slot).every(row=>Math.abs(row.inset-row.padding)<1),scope+' 普通项文字从行内边距开始');
      assert(metrics.filter(row=>row.slot).every(row=>row.glyph===(row.checked==='true')),scope+' 未勾选保留槽且已勾选显示图标');
      assert(menu.scrollWidth<=menu.clientWidth,scope+' 无水平溢出');samples.push({scope,metrics});
    };
    for(const [theme,name] of [['github.css','Github'],['night.css','Night'],['cpp_github-consolas.css','Cpp Github Consolas']]){
      await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(650);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
      for(const zoom of [1,1.25]){
        reqnode('electron').webFrame.setZoomFactor(zoom);window.resizeTo(1280,850);await pause(200);
        for(const name of ['编辑','视图','文件']){
          escape();const button=[...document.querySelectorAll('.workspace-titlebar-menu>button')].find(node=>node.textContent===name);assert(!!button,'实际顶栏 '+name);button.click();await pause(120);
          const popup=document.querySelector('.workspace-titlebar-popup');inspect(popup,'.workspace-titlebar-label','.workspace-titlebar-check',theme+'/'+zoom+'/'+name);
          if(name==='编辑')assert(!popup.querySelector('.workspace-titlebar-check'),'真实编辑菜单全部普通命令无空状态列');
          if(name==='视图')assert(!!popup.querySelector('[role=menuitemcheckbox]')&&!!popup.querySelector('[role=menuitem]'),'真实视图菜单混合状态');
          escape();assert(!document.querySelector('.workspace-titlebar-popup'),'Esc正常关闭顶栏');
        }
        document.querySelector('.workspace-preferences-trigger').click();await pause(80);
        inspect(document.querySelector('.workspace-preferences-menu'),'.git-menu-label','.git-menu-check',theme+'/'+zoom+'/齿轮');escape();
        const menu=app.workspace.ribbon.ribbonView.dispalyMenu;
        menu.empty().addItem(item=>item.setTitle('普通')).addItem(item=>item.setTitle('未选').set_checked(false)).addItem(item=>item.setTitle('已选').set_checked(true));menu.showAtPosition({x:100,y:100});await pause(40);
        inspect(menu.containerEl,'.typ-menu-label','.typ-menu-icon',theme+'/'+zoom+'/核心');menu.close();
      }
    }
    assert(fs.readFileSync(path.join(base,'workspace/front.md'),'utf8')===original,'正文未改写');
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'原始Typora1.14.10/Win11，renderer点击/键盘；未做Win10或物理键鼠现场验收。'},null,2));
  }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,samples,error:String(error),stack:error.stack},null,2));}
})();
