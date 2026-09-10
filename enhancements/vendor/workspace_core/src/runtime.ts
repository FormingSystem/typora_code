import './setup';
import {useService} from './common/service';
export async function initialize() {
 const app=useService('app');app.initialize();
 const started=Date.now();
 while(!app.workspace.rootSplit.containerEl.isConnected || !app.workspace.sidebar.panels?.length){
  if(Date.now()-started>15000)throw new Error('Typora Code workspace mount timed out');
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 app.start();return app;
}
