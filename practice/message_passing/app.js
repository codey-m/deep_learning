import {CASES,STAGES,starter,neighborsFor,copyCase,format,indentSelection} from './model.mjs';
import {createEditor} from './editor.mjs';
import {PythonExecutor} from './execution.mjs';
const $=id=>document.getElementById(id), name=i=>String.fromCharCode(65+i);
const positions=[[74,74],[337,74],[205,160],[332,252],[75,252]];
const svgNS='http://www.w3.org/2000/svg';
const TRAVEL_MS=900,HOLD_MS=1100,LOOP_R=12;
let stage='sum',caseIndex=0,graph=copyCase(CASES[0]),selected=2,version=0,last=null,busy=false,playToken=0,stepIndex=0;
// Display state. 'before': every node shows its original feature (messages read these).
// 'after': every node shows the function's returned value, with "was" retaining the original.
// newLabels: nodes whose returned value is shown beside an unchanged original, during the before view.
let view='before',newLabels=new Set(),active=new Set();
const drafts={sum:starter('sum'),mean:starter('mean'),self:starter('self')};
$('code').value=drafts.sum;
function lines(){const editor=$('code');$('line-numbers').textContent=editor.value.split('\n').map((_,i)=>i+1).join('\n');$('line-numbers').scrollTop=editor.scrollTop;}
let activeExecutor=null;
const restartReference=new URLSearchParams(location.search).has('restart_reference');
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function runtimeStatus(owner,{state,message}){
 if(activeExecutor!==owner)return;
 $('runtime').textContent=message;$('retry').hidden=state!=='error';
 $('run').disabled=busy||state==='loading';$('suite').disabled=busy||state==='loading';$('reference').disabled=busy||state==='loading';
 $('stop').disabled=!busy&&state!=='loading';
}
function reportMetrics(metrics){window.dispatchEvent(new CustomEvent('python-run-measured',{detail:{...metrics,mode:metrics.role,implementation:restartReference?'forced-restart':'warm-reuse'}}));}
const studentExecutor=new PythonExecutor({role:'student',onStatus:s=>runtimeStatus(studentExecutor,s),onMetrics:reportMetrics});
const referenceExecutor=new PythonExecutor({role:'reference',onStatus:s=>runtimeStatus(referenceExecutor,s),onMetrics:reportMetrics});
function el(tag,attrs={},text){const node=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
function feedback(text,kind=''){$('result-panel').hidden=false;$('verdict').textContent=text;$('verdict').className=kind;}
function stopPlayback(){++playToken;$('graph').querySelectorAll('.packet').forEach(p=>p.remove());}
const isReference=()=>last?.request.mode==='reference';
const outputAt=i=>last?.result.values?.[i];
const differsAt=i=>outputAt(i)!==undefined&&!isReference()&&!last.result.matches[i];
function invalidate(message){
 version++;stopPlayback();
 if(busy){
  busy=false;
  // A first Python download can take many seconds. Abandon the pending run, keep the download.
  if(activeExecutor&&!activeExecutor.isLoading)activeExecutor.cancel();
 }
 last=null;view='before';newLabels=new Set();active=new Set();
 $('run-label').textContent=message;$('result-panel').hidden=true;
 $('error-box').hidden=true;$('test-details').hidden=true;$('stdout-details').hidden=true;
 $('replay').disabled=true;$('step').disabled=true;
 draw();
}
function loopCenter(i){const[x,y]=positions[i];return[x,y-32-LOOP_R];}
function draw(){
 const svg=$('graph');svg.replaceChildren();const neighbors=neighborsFor(graph);
 for(const[a,b]of graph.edges){const p=positions[a],q=positions[b];svg.append(el('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],class:`edge ${active.has(a)||active.has(b)?'active':''}`}));}
 if(stage==='self')graph.features.forEach((_,i)=>{const[cx,cy]=loopCenter(i);svg.append(el('circle',{cx,cy,r:LOOP_R,class:`edge self-loop ${active.has(i)?'active':''}`}));});
 graph.features.forEach((feature,i)=>{
  const[x,y]=positions[i];const output=outputAt(i);
  const showAfter=view==='after'&&output!==undefined,showNew=view==='before'&&newLabels.has(i)&&output!==undefined;
  const differs=(showAfter||showNew)&&differsAt(i);
  const source=isReference()?'reference result':'your result';
  const spoken=showAfter||showNew?`, ${source} ${format(output)}${differs?', differs from this rule':''}`:'';
  const group=el('g',{class:`node ${i===selected?'selected':''} ${active.has(i)?'active':''} ${differs?'different':''}`,transform:`translate(${x} ${y})`,role:'button',tabindex:'0','aria-label':`Node ${name(i)}, original feature ${format(feature)}${spoken}. Inspect node.`,'aria-pressed':String(i===selected)});
  group.append(el('circle',{r:32}),el('text',{class:'node-name',y:-11},name(i)),el('text',{class:'node-value',y:15},format(showAfter?output:feature)));
  if(showAfter)group.append(el('text',{class:'node-sub',y:52},`was ${format(feature)}${differs?' · ≠':''}`));
  if(showNew)group.append(el('text',{class:'node-sub new',y:52},`new ${format(output)}${differs?' · ≠':''}`));
  group.addEventListener('click',()=>selectNode(i));group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(i,true);}});svg.append(group);
 });
 $('selected-name').textContent=name(selected);$('feature').value=graph.features[selected];
 describeSelected(neighbors);
 $('input-code').textContent=`features = ${JSON.stringify(graph.features)}\nneighbors = {\n${Object.entries(neighbors).map(([i,ns])=>`    ${i}: ${JSON.stringify(ns)},  # ${name(Number(i))}`).join('\n')}\n}`;
}
// The rule's intended arithmetic for one node, built from the displayed graph (not a trace of learner code).
function ruleExpression(i,neighbors){
 const vals=neighbors[i].map(j=>graph.features[j]),own=graph.features[i];
 const terms=vals.map(format).join(' + ');
 if(stage==='sum')return vals.length?`${terms} = ${format(vals.reduce((a,b)=>a+b,0))}`:'no messages → 0';
 if(stage==='mean')return vals.length?`(${terms}) ÷ ${vals.length} = ${format(vals.reduce((a,b)=>a+b,0)/vals.length)}`:'no messages → 0';
 return vals.length?`${terms} + own ${format(own)} = ${format(vals.reduce((a,b)=>a+b,own))}`:`own ${format(own)} → ${format(own)}`;
}
function describeSelected(neighbors){
 const i=selected,incoming=neighbors[i].map(j=>`${name(j)} (${format(graph.features[j])})`);
 let text=incoming.length?`${name(i)} reads ${incoming.join(', ')}.${stage==='self'?` It also keeps its own ${format(graph.features[i])}.`:''}`:`${name(i)} has no neighbors. ${stage==='self'?'This rule keeps its own feature.':'This rule returns 0 here.'}`;
 const output=outputAt(i);
 if(output!==undefined){
  if(isReference())text+=` Reference: ${ruleExpression(i,neighbors)}.`;
  else if(!differsAt(i))text+=` Your function returned ${format(output)}: ${ruleExpression(i,neighbors)}.`;
  else{
   const msgs=neighbors[i].map(j=>format(graph.features[j]));if(stage==='self')msgs.push(`own ${format(graph.features[i])}`);
   text+=` Messages in: ${msgs.length?msgs.join(', '):'none'}. Your function returned ${format(output)}, which differs from this rule.`;
  }
 }
 $('neighbor-description').textContent=text;
}
function selectNode(i,restoreFocus=false){stopPlayback();active=new Set();selected=i;draw();if(restoreFocus)$('graph').querySelectorAll('.node')[i]?.focus();}
// Packets carry the sender's original feature, labelled, along each link into each target.
// For the self rule a packet also circles the node's self-loop.
function makePackets(targets){
 const neighbors=neighborsFor(graph),packets=[];
 for(const i of targets){
  for(const j of neighbors[i])packets.push({from:j,to:i,value:graph.features[j]});
  if(stage==='self')packets.push({from:i,to:i,value:graph.features[i],self:true});
 }
 return packets.map(p=>{
  const node=el('g',{class:'packet','aria-hidden':'true'});
  const label=`${p.self?'own ':''}${format(p.value)}`,width=Math.max(28,label.length*10+14);
  node.append(el('rect',{x:-width/2,y:-11,width,height:22,rx:11}),el('text',{y:5},label));
  const [x,y]=packetPosition(p,0);node.setAttribute('transform',`translate(${x} ${y})`);
  $('graph').append(node);return{...p,node};
 });
}
function packetPosition(p,t){
 if(p.self){const[cx,cy]=loopCenter(p.to),a=Math.PI/2+2*Math.PI*t;return[cx+LOOP_R*Math.cos(a),cy+LOOP_R*Math.sin(a)];}
 const[a,b]=positions[p.from],[x,y]=positions[p.to],dx=x-a,dy=y-b,len=Math.hypot(dx,dy)||1;
 // Offset to the right of travel so the two directions on one link do not overlap.
 const ox=-dy/len*9,oy=dx/len*9,e=t<.5?2*t*t:1-2*(1-t)*(1-t);
 const start=32/len,end=1-34/len,s=start+(end-start)*e;
 return[a+dx*s+ox,b+dy*s+oy];
}
function wait(ms,token){return new Promise(resolve=>setTimeout(()=>resolve(token===playToken),ms));}
async function sendMessages(targets,token){
 const packets=makePackets(targets);
 await new Promise(resolve=>{
  let start;
  function frame(t){
   if(token!==playToken){packets.forEach(p=>p.node.remove());resolve();return;}
   start??=t;const progress=Math.min(1,Math.max(0,(t-start)/TRAVEL_MS));
   for(const p of packets){const[x,y]=packetPosition(p,progress);p.node.setAttribute('transform',`translate(${x} ${y})`);}
   if(progress<1)requestAnimationFrame(frame);else{packets.forEach(p=>p.node.remove());resolve();}
  }requestAnimationFrame(frame);
 });
 return token===playToken;
}
function announce(text){$('play-status').textContent=text;}
// One synchronous step: every message leaves at once, from original values; then all nodes update together.
async function playUpdate(){
 stopPlayback();const token=playToken;if(!last?.result.values)return;
 const all=[0,1,2,3,4];
 if(reducedMotion()){view='after';newLabels=new Set();active=new Set();draw();announce(updateSummary());return;}
 view='before';newLabels=new Set();active=new Set(all);draw();
 if(!await sendMessages(all,token))return;
 newLabels=new Set(all);draw();
 if(!await wait(HOLD_MS,token))return;
 view='after';newLabels=new Set();active=new Set();draw();announce(updateSummary());
}
function updateSummary(){
 const values=last.result.values.map(format).join(', ');
 const label=isReference()?'Reference update':'Your update';
 const wrong=isReference()?0:last.result.matches.filter(ok=>!ok).length;
 return `${label}: all five nodes now hold ${values}.${wrong?` ${wrong} differ from this rule.`:''}`;
}
async function stepNode(){
 stopPlayback();const token=playToken;if(!last?.result.values)return;
 const i=stepIndex++%5;selected=i;view='before';newLabels=new Set();active=new Set([i]);draw();
 if(!reducedMotion()&&!await sendMessages([i],token))return;
 newLabels=new Set([i]);draw();
 const differs=differsAt(i);
 announce(`${name(i)}: new value ${format(outputAt(i))}${differs?', differs from this rule':''}. Other nodes still show original features.`);
}
function showResult(result,request){
 last={result,request};const reference=request.mode==='reference';$('run-label').textContent=reference?'Reference result · current graph':'Your result · current code and graph';
 $('error-box').hidden=!result.error;$('error').textContent=result.error?`${result.error}${result.returned?`\nReturned: ${result.returned}`:''}`:'';
 if(reference&&!result.error)feedback('Reference run complete. The nodes show the correct update for this rule. Your code is unchanged.');
 else if(result.error)feedback('The function did not return five finite features. Read the error below.','fail');
 else if(result.mutated)feedback('The function changed its input data. This step needs every node to read the same original graph. Returned values are shown in the nodes.','fail');
 else if(result.passed)feedback('All five returned values match this rule on this graph. Test another graph to check what generalizes.','pass');
 else{const failed=result.matches.map((ok,i)=>ok?null:name(i)).filter(Boolean);feedback(`${failed.length} returned value${failed.length===1?' differs':'s differ'} from this rule: ${failed.join(', ')}. The nodes show what your function returned; dashed outlines mark differences.`,'fail');}
 $('stdout-details').hidden=!result.stdout;$('stdout').textContent=result.stdout;
 $('test-details').hidden=!result.suite;
 if(result.suite){
  const passed=result.suite.filter(r=>r.passed).length;$('test-summary').textContent=`Other graphs: ${passed} of ${result.suite.length} checks passed`;
  $('test-results').replaceChildren();
  for(const row of result.suite){const div=document.createElement('div');div.className=`test-row ${row.passed?'match':'mismatch'}`;div.textContent=`${row.passed?'✓':'≠'} ${row.name}: ${row.passed?'matches the rule without changing inputs':row.error|| (row.mutated?'input data changed':`returned ${row.values.map(format).join(', ')}; does not match the rule`)}`;$('test-results').append(div);}
  $('test-details').open=true;
 }
 $('replay').disabled=!result.values;$('step').disabled=!result.values;stepIndex=0;
 view='before';newLabels=new Set();active=new Set();draw();
 if(result.values)playUpdate();
}
async function run(suite=false,mode='student'){
 if(busy)return;stopPlayback();busy=true;const runVersion=version;
 const request={case:copyCase(graph),stage,suite,mode};
 if(mode==='student')request.code=$('code').value;
 activeExecutor=mode==='reference'?referenceExecutor:studentExecutor;
 if(mode==='reference'&&restartReference)referenceExecutor.dispose('Developer baseline: restart reference worker.');
 last=null;view='before';newLabels=new Set();active=new Set();
 $('result-panel').hidden=true;$('run-label').textContent=mode==='reference'?'Running reference…':'Running your code…';$('replay').disabled=true;$('step').disabled=true;draw();
 $('run').disabled=true;$('suite').disabled=true;$('reference').disabled=true;$('stop').disabled=false;$('error-box').hidden=true;
 try{const result=await activeExecutor.run(request,{isCurrent:()=>version===runVersion});if(version===runVersion)showResult(result,request);}
 catch(error){if(version===runVersion&&!error.superseded){last=null;feedback(error.message,'fail');$('run-label').textContent='Run stopped';$('replay').disabled=true;$('step').disabled=true;draw();}}
 finally{if(version===runVersion){busy=false;$('run').disabled=false;$('suite').disabled=false;$('reference').disabled=false;$('stop').disabled=true;}}
}
$('run').onclick=()=>run();$('suite').onclick=()=>run(true);$('reference').onclick=()=>run(false,'reference');
$('stop').onclick=()=>{const executor=activeExecutor;invalidate('Stopped. Your code is preserved. Run again when you are ready.');executor?.cancel();};
$('retry').onclick=()=>activeExecutor?.load().catch(()=>{});
// Reference output depends only on the displayed inputs, so code edits keep it (and any reference run in progress).
const referenceShown=()=>activeExecutor===referenceExecutor&&(busy||last?.request.mode==='reference');
$('code').oninput=()=>{lines();drafts[stage]=$('code').value;if(!referenceShown())invalidate('Code changed. Run again to see its result.');};
$('code').onscroll=lines;
let escapeTab=false;
$('code').onkeydown=event=>{
 if(event.key==='Escape'){escapeTab=true;return;}
 if(event.key==='Tab'&&!event.shiftKey&&!escapeTab){event.preventDefault();const editor=$('code'),change=indentSelection(editor.value,editor.selectionStart,editor.selectionEnd);editor.value=change.text;editor.setSelectionRange(change.start,change.end);editor.dispatchEvent(new Event('input'));}
 else if(event.key!=='Shift')escapeTab=false;
 if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}
};
$('code').onblur=()=>{escapeTab=false;};
$('reset').onclick=()=>{$('code').value=starter(stage);lines();drafts[stage]=$('code').value;invalidate('Rule reset. Complete your update function, then run.');};
$('download').onclick=()=>{
 const blob=new Blob([`# Message passing: ${stage}\n${$('input-code').textContent}\n\n${$('code').value}\n\nprint(message_pass(features, neighbors))\n`],{type:'text/x-python'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`message-passing-${stage}.py`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
for(const button of document.querySelectorAll('[data-stage]'))button.onclick=()=>{
 if(stage===button.dataset.stage)return;drafts[stage]=$('code').value;stage=button.dataset.stage;$('code').value=drafts[stage];lines();
 for(const item of document.querySelectorAll('[data-stage]'))item.setAttribute('aria-pressed',String(item===button));
 $('task-title').textContent=STAGES[stage].title;$('task-description').textContent=STAGES[stage].description;$('hint').textContent=STAGES[stage].hint;$('transfer').textContent=STAGES[stage].transfer;invalidate('New rule selected. Run your function or the reference to see the update.');
};
$('feature').onchange=()=>{const value=$('feature').valueAsNumber;if(!Number.isFinite(value)||Math.abs(value)>100){$('feature').setCustomValidity('Enter a number between -100 and 100.');$('feature').reportValidity();return;}$('feature').setCustomValidity('');graph.features[selected]=value;invalidate('A feature changed. Run again to see the new result.');};
$('new-case').onclick=()=>{caseIndex=(caseIndex+1)%CASES.length;graph=copyCase(CASES[caseIndex]);$('graph-title').textContent=graph.name;$('extra-edge').checked=graph.edges.some(([a,b])=>a===0&&b===4);invalidate('New graph, same code. Run again to see the result.');};
$('extra-edge').onchange=()=>{graph.edges=graph.edges.filter(([a,b])=>!(a===0&&b===4));if($('extra-edge').checked)graph.edges.push([0,4]);invalidate('The A—E link changed. Run again to see its effect.');};
$('replay').onclick=playUpdate;$('step').onclick=stepNode;
window.addEventListener('pagehide',()=>{stopPlayback();studentExecutor.dispose('Page closed.');referenceExecutor.dispose('Page closed.');});
$('hint').textContent=STAGES.sum.hint;lines();draw();
// Shared CodeMirror editor (../_shared/editor.mjs). The textarea keeps working as before; its value now proxies the editor.
window.pythonEditor=createEditor({textarea:$('code'),gutter:$('line-numbers'),manage:false,enhance:!new URLSearchParams(location.search).has('plain_editor')});
