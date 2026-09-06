/** 把 TextMate 语法角色映射为颜色，不把宏体所在的 meta 容器当成 token 类型。 */
export function scope_style(scopes: string[]): string {
  const joined = scopes.join(" ");
  if (/\binvalid(?:\.|\b)/u.test(joined)) return "tm-invalid";
  if (/\bcomment(?:\.|\b)/u.test(joined)) return "tm-comment";
  if (/\bstring(?:\.|\b)/u.test(joined)) return "tm-string";
  if (/\bconstant\.numeric(?:\.|\b)/u.test(joined)) return "tm-number";
  // meta.preprocessor 覆盖整个宏体；仅指令和宏定义名使用预处理器颜色。
  if (/\bkeyword\.control\.directive(?:\.|\b)|\bentity\.name\.function\.preprocessor(?:\.|\b)/u.test(joined)) return "tm-preprocessor";
  if (/\bentity\.name\.function(?:\.|\b)|\bsupport\.function(?:\.|\b)|\bentity\.name\.operator(?:\.|\b)/u.test(joined)) return "tm-function";
  if (/\bvariable\.parameter(?:\.|\b)/u.test(joined)) return "tm-parameter";
  if (/\bvariable\.other\.property(?:\.|\b)|\bvariable\.object\.property(?:\.|\b)/u.test(joined)) return "tm-property";
  if (/\bentity\.name\.namespace(?:\.|\b)|\bentity\.name\.scope-resolution(?:\.|\b)/u.test(joined)) return "tm-namespace";
  if (/\bsupport\.type(?:\.|\b)|\bsupport\.class(?:\.|\b)|\bentity\.name\.type(?:\.|\b)|\bentity\.name\.class(?:\.|\b)/u.test(joined)) return "tm-type";
  if (/\bentity\.other\.attribute(?:\.|\b)/u.test(joined)) return "tm-attribute";
  if (/\bkeyword\.control(?:\.|\b)|\bkeyword\.other\.(?:using|operator)(?:\.|\b)/u.test(joined)) return "tm-control";
  // 运算符属于 keyword 的子类，必须先于通用关键字判断。
  if (/\bkeyword\.operator(?:\.|\b)/u.test(joined)) return "tm-operator";
  if (/\bstorage(?:\.|\b)|\bkeyword(?:\.|\b)/u.test(joined)) return "tm-keyword";
  if (/\bvariable(?:\.|\b)|\bmeta\.definition\.variable\.name(?:\.|\b)|\bentity\.name\.variable(?:\.|\b)|\bsupport\.variable(?:\.|\b)/u.test(joined)) return "tm-variable";
  if (/\bconstant(?:\.|\b)/u.test(joined)) return "tm-constant";
  if (/\bpunctuation(?:\.|\b)/u.test(joined)) return "tm-punctuation";
  return "tm-plain";
}
