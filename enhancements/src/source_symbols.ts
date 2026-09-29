import {workspace_text} from "./workspace_i18n";
import type {Node} from "web-tree-sitter";
export type source_symbol = {name:string;kind:string;detail:string;start:number;end:number;selection_start:number;selection_end:number;children:source_symbol[]};
export const SOURCE_SYMBOL_LANGUAGES:Record<string,string>={javascript:"javascript",typescript:"typescript",python:"python",cmake:"cmake",yaml:"yaml"};

/** Extract syntax symbols from formal grammar nodes; do not execute macros, scripts, or configurations, and do not treat references as declarations. */
export function extract_source_symbols(root:Node,language:string):source_symbol[] {
  let count=0;
  const symbol=(node:Node,name:Node,kind:string,detail:string,children:source_symbol[]=[],label=name.text):source_symbol=>({name:label,kind,detail,start:node.startIndex,end:node.endIndex,selection_start:name.startIndex,selection_end:name.endIndex,children});
  const walk=(node:Node,depth=0):source_symbol[]=>{
    if(node.isError||node.isMissing)return [];
    const descend=(target=node)=>target.namedChildren.flatMap(child=>walk(child,depth+1));
    const emit=(name:Node|null,kind:string,detail:string,body?:Node|null,label?:string)=>{
      if(!name)return descend();count++;return [symbol(node,name,kind,detail,body?descend(body):[],label??name.text)];
    };
    if(language==="javascript"||language==="typescript"){
      if(["function_declaration","generator_function_declaration","function_signature","method_definition","method_signature","abstract_method_signature"].includes(node.type))return emit(node.childForFieldName("name"),node.type.includes("method")?"method":"function",node.childForFieldName("body")?workspace_text("source_symbols_function_definition"):workspace_text("source_symbols_function_declaration"),node.childForFieldName("body"));
      if(["class_declaration","abstract_class_declaration","interface_declaration","enum_declaration","internal_module","type_alias_declaration"].includes(node.type))return emit(node.childForFieldName("name"),node.type==="internal_module"?"namespace":node.type==="enum_declaration"?"enum":"class",node.type,node.childForFieldName("body"));
      if(node.type==="variable_declarator"){
        const value=node.childForFieldName("value"),function_value=value&&["arrow_function","function_expression","generator_function"].includes(value.type);
        return emit(node.childForFieldName("name"),function_value?"function":"variable",function_value?workspace_text("source_symbols_function_definition"):workspace_text("source_symbols_variable_declaration"),value);
      }
      if(node.parent?.type==="enum_body"&&node.parent.childrenForFieldName("name").some(name=>name.id===node.id))return emit(node,"property",workspace_text("source_symbols_enum_member"));
      if(["public_field_definition","property_signature","pair","enum_assignment"].includes(node.type))return emit(node.childForFieldName("name")||node.childForFieldName("key"),"property",workspace_text("source_symbols_property"),node.childForFieldName("value"));
    } else if(language==="python"){
      if(node.type==="function_definition"||node.type==="class_definition")return emit(node.childForFieldName("name"),node.type==="class_definition"?"class":"function",node.type==="class_definition"?workspace_text("source_symbols_class_definition"):workspace_text("source_symbols_function_definition"),node.childForFieldName("body"));
      if(node.type==="assignment"){
        const right=node.childForFieldName("right");
        return [...emit(node.childForFieldName("left"),"variable",workspace_text("source_symbols_assignment_target")),...(right?.type==="assignment"?walk(right,depth+1):[])];
      }
    } else if(language==="cmake"){
      if(node.type==="function_def"||node.type==="macro_def"){
        const command=node.namedChildren[0],name=command?.namedChildren.find(child=>child.type==="argument_list")?.namedChildren[0];
        return emit(name||null,"function",node.type==="macro_def"?workspace_text("source_symbols_macro_definition"):workspace_text("source_symbols_function_definition"),node.namedChildren.find(child=>child.type==="body"));
      }
      if(node.type==="normal_command"){
        const command=node.namedChildren[0]?.text.toLowerCase(),args=node.namedChildren.find(child=>child.type==="argument_list"),name=args?.namedChildren[0];
        if(command&&["set","option","add_library","add_executable"].includes(command))return emit(name||null,command.startsWith("add_")?"namespace":"variable",command);
        return [];
      }
    } else if(language==="yaml"){
      if(node.type==="block_mapping_pair"||node.type==="flow_pair")return emit(node.childForFieldName("key"),"property",workspace_text("source_symbols_configuration_key"),node.childForFieldName("value"));
      if(node.type==="block_sequence_item"){
        const index=node.parent?.namedChildren.findIndex(child=>child.id===node.id)??0;count++;return [symbol(node,node,"namespace",workspace_text("source_symbols_list_item"),descend(),`[${index}]`)];
      }
    }
    return descend();
  };
  return walk(root);
}
