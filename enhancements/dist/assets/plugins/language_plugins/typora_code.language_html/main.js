// Community v2 ABI; runtime and configuration remain owned by the host adapter.
const {Plugin}=window[Symbol.for('typora-plugin-core@v2')];
export default class language_environment_plugin extends Plugin {
 onload(){this.app.language_environments.register(this);}
}
