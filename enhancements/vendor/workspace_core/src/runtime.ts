import './setup';
import {useService} from './common/service';
export async function initialize() {
 const app=useService('app');app.initialize();
 app.workspace.mount();
 if(!app.workspace.rootSplit.containerEl.isConnected)throw new Error('Typora Code workspace mount failed');
 app.start();return app;
}
