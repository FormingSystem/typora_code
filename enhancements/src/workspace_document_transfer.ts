import type {editor} from "monaco-editor/editor/editor.api";
import type {reading_position} from "./reading_positions";
import type {text_document_eol} from "./workspace_text_document";
import type {graph_leaf} from "./git_graph_host";

export type workspace_transfer_format = {encoding:string; bom:boolean; eol:text_document_eol};
/** Receive the real editing group within the window; the protocol must not serialize or accept group objects from other windows. */
export type workspace_transfer_target = {group:graph_leaf["parent"]; index:number};

/** Only pass memory snapshots between two already handshaken windows; do not save to temporary files or workspaces. */
export type workspace_document_snapshot = {
  schema:1;
  capture_id:string;
  capture_fingerprint:string;
  kind:"source"|"markdown";
  file_path:string;
  root:string;
  text:string;
  dirty:boolean;
  disk_sha256:string;
  source_format?:workspace_transfer_format;
  source_baseline_format?:workspace_transfer_format;
  source_baseline?:string;
  source_model_eol?:"\n"|"\r\n";
  markdown_baseline?:string;
  language?:string;
  view_state?:editor.ICodeEditorViewState|null;
  reading_position?:reading_position;
};
