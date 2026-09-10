import type {editor} from "monaco-editor/editor/editor.api";
import type {reading_position} from "./reading_positions";
import type {text_document_eol} from "./workspace_text_document";

export type workspace_transfer_format = {encoding:string; bom:boolean; eol:text_document_eol};

/** 仅在两个已握手窗口之间传递的内存快照；不保存到临时文件或工作区。 */
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
