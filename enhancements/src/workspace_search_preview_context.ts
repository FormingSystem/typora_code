import {file_key} from "./workspace_file_uri";
import type {workspace_search_file} from "./workspace_search_engine";

type search_preview_context={file:workspace_search_file};
let owner:symbol|undefined;
const files=new Map<string,workspace_search_file>();
const listeners=new Set<()=>void>();
const notify=()=>{for(const listener of listeners)listener();};

/** Search owns the snapshot; independent preview sessions only borrow match identities. */
export function create_search_preview_context(){
  const token=Symbol();owner=token;files.clear();notify();
  return {
    publish(file:workspace_search_file){if(owner!==token)return;files.set(file_key(file.file_path),file);notify();},
    remove(path:string){if(owner!==token)return;files.delete(file_key(path));notify();},
    clear(){if(owner!==token)return;files.clear();notify();},
    dispose(){if(owner!==token)return;files.clear();owner=undefined;notify();}
  };
}
export function read_search_preview_context(path:string):search_preview_context|undefined{
  const key=file_key(path),file=files.get(key);if(!file?.matches.length)return;
  return {file};
}
export function observe_search_preview_context(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);}
