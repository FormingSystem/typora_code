export const coreVersion=()=>"2.10.15-typora-code.1";
export const globalRootDir=()=>reqnode('path').join(_options.userDataPath,'typora_code');
export const globalConfigDir=()=>reqnode('path').join(globalRootDir(),'settings');
export const coreDir=()=>globalRootDir();
export const platform=()=>globalThis.process?.platform||'win32';
export const isDebug=()=>false;
