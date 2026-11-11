// Shared code editor for editable-Python prototypes.
// Progressive enhancement: the page's plain textarea works immediately (line numbers, Tab indents,
// Escape then Tab leaves, Command/Ctrl+Enter runs). CodeMirror 6 then mounts in its place with the
// current text, if its pinned modules load in time. The page needs the inline import map from
// _shared/editor-importmap.json. No completion or code leaves the browser; there is no AI assistance.

export function indentSelection(text,start,end){
 const lineStart=text.lastIndexOf('\n',start-1)+1;
 if(start===end)return {text:text.slice(0,start)+'    '+text.slice(end),start:start+4,end:start+4};
 const block=text.slice(lineStart,end),replacement=block.split('\n').map(line=>'    '+line).join('\n');
 return {text:text.slice(0,lineStart)+replacement+text.slice(end),start:start+4,end:end+replacement.length-block.length};
}

// Plain-textarea editor: the fallback and the initial state.
function textareaEditor({textarea,gutter,onChange,onRun}){
 const lines=()=>{if(!gutter)return;gutter.textContent=textarea.value.split('\n').map((_,i)=>i+1).join('\n');gutter.scrollTop=textarea.scrollTop;};
 let escapeTab=false;
 const handlers={
  input:()=>{lines();onChange();},
  scroll:lines,
  blur:()=>{escapeTab=false;},
  keydown:event=>{
   if(event.key==='Escape'){escapeTab=true;return;}
   if(event.key==='Tab'&&!event.shiftKey&&!escapeTab){event.preventDefault();const c=indentSelection(textarea.value,textarea.selectionStart,textarea.selectionEnd);textarea.value=c.text;textarea.setSelectionRange(c.start,c.end);lines();onChange();}
   else if(event.key!=='Shift')escapeTab=false;
   if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();onRun();}
  }
 };
 for(const [type,fn] of Object.entries(handlers))textarea.addEventListener(type,fn);
 lines();
 return {
  kind:'textarea',
  getValue:()=>textarea.value,
  setValue(text,{user=false}={}){textarea.value=text;lines();if(user)onChange();},
  focus:()=>textarea.focus(),
  detach(){for(const [type,fn] of Object.entries(handlers))textarea.removeEventListener(type,fn);},
 };
}

const NATIVE_VALUE=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
const THEME={
 '&':{height:'100%',fontSize:'14px',backgroundColor:'#f6f8fa',color:'#13344b'},
 '.cm-scroller':{fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace',lineHeight:'1.6'},
 '.cm-content':{padding:'12px 0'},
 '.cm-gutters':{backgroundColor:'#e8eef1',color:'#526169',border:'none'},
 '.cm-activeLine':{backgroundColor:'#eef3f6'},
 '.cm-activeLineGutter':{backgroundColor:'#dbe4e9',color:'#203747'},
 '&.cm-focused':{outline:'3px solid #a31f34',outlineOffset:'2px'},
 '.cm-tooltip-autocomplete':{fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace',fontSize:'13px'},
};

async function loadCodeMirror(){
 const [state,view,commands,language,autocomplete,python]=await Promise.all([
  import('@codemirror/state'),import('@codemirror/view'),import('@codemirror/commands'),
  import('@codemirror/language'),import('@codemirror/autocomplete'),import('@codemirror/lang-python')]);
 return {state,view,commands,language,autocomplete,python};
}

function mountCodeMirror(cm,{textarea,gutter,host,onChange,onRun}){
 const {EditorState,Prec}=cm.state,{EditorView,keymap,lineNumbers,highlightActiveLine,highlightActiveLineGutter,drawSelection}=cm.view;
 const {defaultKeymap,history,historyKeymap,indentWithTab}=cm.commands;
 const {indentOnInput,bracketMatching,syntaxHighlighting,defaultHighlightStyle,indentUnit}=cm.language;
 const {autocompletion,closeBrackets,closeBracketsKeymap,completionKeymap}=cm.autocomplete;
 const labelText=textarea.getAttribute('aria-label')||[...(textarea.labels||[])].map(l=>l.textContent.trim()).filter(Boolean).join(' ')||'Python code';
 const attrs={'aria-label':labelText};
 if(textarea.getAttribute('aria-describedby'))attrs['aria-describedby']=textarea.getAttribute('aria-describedby');
 const view=new EditorView({
  parent:host,
  state:EditorState.create({doc:textarea.value,extensions:[
   lineNumbers(),highlightActiveLineGutter(),highlightActiveLine(),drawSelection(),history(),
   indentUnit.of('    '),EditorState.tabSize.of(4),indentOnInput(),bracketMatching(),closeBrackets(),
   syntaxHighlighting(defaultHighlightStyle,{fallback:true}),cm.python.python(),autocompletion(),
   Prec.highest(keymap.of([{key:'Mod-Enter',run:()=>{onRun();return true;}}])),
   keymap.of([...closeBracketsKeymap,...defaultKeymap,...historyKeymap,...completionKeymap,indentWithTab]),
   EditorView.contentAttributes.of(attrs),EditorView.theme(THEME),
   EditorView.updateListener.of(update=>{
    if(!update.docChanged)return;
    NATIVE_VALUE.set.call(textarea,update.state.doc.toString());
    if(update.transactions.some(t=>t.isUserEvent('input')||t.isUserEvent('delete')||t.isUserEvent('undo')||t.isUserEvent('redo')||t.isUserEvent('move'))){
     onChange();textarea.dispatchEvent(new Event('input',{bubbles:true}));
    }
   }),
  ]}),
 });
 textarea.hidden=true;if(gutter)gutter.hidden=true;host.hidden=false;
 // Compatibility: code that reads or writes textarea.value (app logic, test harnesses) now reads and
 // writes CodeMirror. Programmatic writes do not count as learner edits.
 Object.defineProperty(textarea,'value',{configurable:true,
  get:()=>view.state.doc.toString(),
  set:text=>{text=String(text);NATIVE_VALUE.set.call(textarea,text);if(text!==view.state.doc.toString())view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});}});
 for(const label of textarea.labels||[])label.addEventListener('click',event=>{event.preventDefault();view.focus();});
 return {
  kind:'codemirror',view,
  getValue:()=>view.state.doc.toString(),
  setValue(text,{user=false}={}){view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:user?'input.paste':undefined});},
  focus:()=>view.focus(),
 };
}

// Returns an editor object immediately-usable (textarea) and upgrades it in place when CodeMirror mounts.
// `ready` resolves to 'codemirror' or 'textarea' (with the reason in `fallbackReason`).
// manage=false: the page already handles the textarea (Tab, line numbers, Command/Ctrl+Enter, input events);
// createEditor then only upgrades it, and Command/Ctrl+Enter in CodeMirror is forwarded to the textarea's own handler.
export function createEditor({textarea,gutter=null,onChange=()=>{},onRun=null,timeoutMs=10000,enhance=true,manage=true}){
 onRun=onRun||(()=>textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,ctrlKey:true,bubbles:true,cancelable:true})));
 const editor={},plain=manage?textareaEditor({textarea,gutter,onChange,onRun}):{kind:'textarea',getValue:()=>textarea.value,setValue(text,{user=false}={}){textarea.value=text;if(user)textarea.dispatchEvent(new Event('input',{bubbles:true}));},focus:()=>textarea.focus(),detach(){}};
 const use=impl=>{for(const k of ['kind','getValue','setValue','focus'])editor[k]=impl[k];editor.view=impl.view||null;};
 use(plain);
 editor.ready=(async()=>{
  if(!enhance){editor.fallbackReason='Plain editor requested.';return 'textarea';}
  try{
   const cm=await Promise.race([loadCodeMirror(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Code editor timed out; using the plain editor.')),timeoutMs))]);
   const host=document.createElement('div');host.className='cm-host';host.hidden=true;textarea.parentElement.append(host);
   const hadFocus=document.activeElement===textarea;
   plain.detach();use(mountCodeMirror(cm,{textarea,gutter,host,onChange,onRun}));
   if(hadFocus)editor.focus();
   return 'codemirror';
  }catch(error){editor.fallbackReason=String(error.message||error);return 'textarea';}
 })();
 return editor;
}
