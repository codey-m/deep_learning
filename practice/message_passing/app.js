import {CASES,STAGES,starter,neighborsFor,copyCase,format} from './model.mjs';
import {PythonExecutor} from './execution.mjs';
const $=id=>document.getElementById(id), name=i=>String.fromCharCode(65+i);
const positions=[[74,65],[337,65],[205,150],[332,246],[75,246]];
const svgNS='http://www.w3.org/2000/svg';
let stage='sum',caseIndex=0,graph=copyCase(CASES[0]),selected=2,version=0,last=null,busy=false,playToken=0,stepIndex=0;
const drafts={sum:starter('sum'),mean:starter('mean'),self:starter('self')};
$('code').value=drafts.sum;
let activeExecutor=null;
const restartReference=new URLSearchParams(location.search).has('restart_reference');
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
function stopPlayback(){++playToken;}
function invalidate(message){
 version++;stopPlayback();
 if(busy){busy=false;activeExecutor?.cancel();}
 last=null;$('run-label').textContent=message;$('result-panel').hidden=true;
 $('error-box').hidden=true;$('test-details').hidden=true;$('stdout-details').hidden=true;
 $('replay').disabled=true;$('step').disabled=true;
 draw();
}
function draw(active=-1){
 const svg=$('graph');svg.replaceChildren();const neighbors=neighborsFor(graph);
 for(const[a,b]of graph.edges){const p=positions[a],q=positions[b];svg.append(el('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],class:`edge ${a===active||b===active?'active':''}`}));}
 graph.features.forEach((feature,i)=>{
  const[x,y]=positions[i];const output=last?.result.values?.[i];const source=last?.request.mode==='reference'?'reference result':'your result';
  const differs=output!==undefined&&last.request.mode!=='reference'&&!last.result.matches[i];
  const group=el('g',{class:`node ${i===selected?'selected':''} ${i===active?'active':''} ${differs?'different':''}`,transform:`translate(${x} ${y})`,role:'button',tabindex:'0','aria-label':`Node ${name(i)}, original feature ${feature}${output!==undefined?`, ${source} ${output}`:''}. Inspect node.`,'aria-pressed':String(i===selected)});
  group.append(el('circle',{r:32}),el('text',{class:'node-name',y:-10},name(i)),el('text',{class:'node-value',y:15},format(output===undefined?feature:output)));
  if(output!==undefined)group.append(el('text',{class:'node-before',y:51},`was ${format(feature)}${differs?' · ≠':''}`));
  group.addEventListener('click',()=>selectNode(i));group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(i,true);}});svg.append(group);
 });
 $('selected-name').textContent=name(selected);$('feature').value=graph.features[selected];
 const incoming=neighbors[selected].map(i=>`${name(i)} (${format(graph.features[i])})`);
 $('neighbor-description').textContent=incoming.length?`${name(selected)} reads ${incoming.join(', ')}.${stage==='self'?` It also keeps its own ${format(graph.features[selected])}.`:''}`:`${name(selected)} has no neighbors. ${stage==='self'?'This rule keeps its own feature.':'This rule returns 0 here.'}`;
 $('input-code').textContent=`features = ${JSON.stringify(graph.features)}\nneighbors = {\n${Object.entries(neighbors).map(([i,ns])=>`    ${i}: ${JSON.stringify(ns)},  # ${name(Number(i))}`).join('\n')}\n}`;
}
function selectNode(i,restoreFocus=false){stopPlayback();selected=i;draw();if(restoreFocus)$('graph').querySelectorAll('.node')[i]?.focus();}
async function animateNode(i,token){
 if(token!==playToken||!last?.result.values)return;
 selected=i;draw(i);
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const neighbors=neighborsFor(graph)[i];
 if(stage==='self')neighbors.push(i);
 const particles=neighbors.map(from=>{const node=el('circle',{r:6,class:'packet'});$('graph').append(node);return{node,from};});
 await new Promise(resolve=>{
  let start;
  function frame(t){
   if(token!==playToken){particles.forEach(p=>p.node.remove());resolve();return;}
   start??=t;const progress=Math.min(1,Math.max(0,(t-start)/650));
   for(const{node,from}of particles){const[a,b]=positions[from],[x,y]=positions[i];node.setAttribute('cx',a+(x-a)*progress);node.setAttribute('cy',b+(y-b)*progress);}
   if(progress<1)requestAnimationFrame(frame);else{particles.forEach(p=>p.node.remove());resolve();}
  }requestAnimationFrame(frame);
 });
 if(token===playToken)draw(i);
}
async function replay(){stopPlayback();const token=playToken;for(let i=0;i<5;i++){if(token!==playToken)break;await animateNode(i,token);}if(token===playToken)draw();}
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
 $('replay').disabled=!result.values;$('step').disabled=!result.values;draw();
 if(result.values){stopPlayback();animateNode(selected,playToken);}
}
async function run(suite=false,mode='student'){
 if(busy)return;stopPlayback();busy=true;const runVersion=version;
 const request={case:copyCase(graph),stage,suite,mode};
 if(mode==='student')request.code=$('code').value;
 activeExecutor=mode==='reference'?referenceExecutor:studentExecutor;
 if(mode==='reference'&&restartReference)referenceExecutor.dispose('Developer baseline: restart reference worker.');
 last=null;$('result-panel').hidden=true;$('run-label').textContent=mode==='reference'?'Running reference…':'Running your code…';$('replay').disabled=true;$('step').disabled=true;draw();
 $('run').disabled=true;$('suite').disabled=true;$('reference').disabled=true;$('stop').disabled=false;$('error-box').hidden=true;
 try{const result=await activeExecutor.run(request);if(version===runVersion)showResult(result,request);}
 catch(error){if(version===runVersion){last=null;feedback(error.message,'fail');$('run-label').textContent='Run stopped';$('replay').disabled=true;$('step').disabled=true;draw();}}
 finally{if(version===runVersion){busy=false;$('run').disabled=false;$('suite').disabled=false;$('reference').disabled=false;$('stop').disabled=true;}}
}
$('run').onclick=()=>run();$('suite').onclick=()=>run(true);$('reference').onclick=()=>run(false,'reference');
$('stop').onclick=()=>{invalidate('Stopped. Your code is preserved. Run again when you are ready.');activeExecutor?.cancel();};
$('retry').onclick=()=>activeExecutor?.load().catch(()=>{});
$('code').oninput=()=>{drafts[stage]=$('code').value;invalidate('Code changed. Run again to see its result.');};
$('code').onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}};
$('reset').onclick=()=>{$('code').value=starter(stage);drafts[stage]=$('code').value;invalidate('Rule reset. Complete your update function, then run.');};
$('download').onclick=()=>{
 const blob=new Blob([`# Message passing: ${stage}\n${$('input-code').textContent}\n\n${$('code').value}\n\nprint(message_pass(features, neighbors))\n`],{type:'text/x-python'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`message-passing-${stage}.py`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
for(const button of document.querySelectorAll('[data-stage]'))button.onclick=()=>{
 if(stage===button.dataset.stage)return;drafts[stage]=$('code').value;stage=button.dataset.stage;$('code').value=drafts[stage];
 for(const item of document.querySelectorAll('[data-stage]'))item.setAttribute('aria-pressed',String(item===button));
 $('task-title').textContent=STAGES[stage].title;$('task-description').textContent=STAGES[stage].description;$('hint').textContent=STAGES[stage].hint;$('transfer').textContent=STAGES[stage].transfer;invalidate('New rule selected. Run your function or the reference to see the update.');
};
$('feature').onchange=()=>{const value=$('feature').valueAsNumber;if(!Number.isFinite(value)||Math.abs(value)>100){$('feature').setCustomValidity('Enter a number between -100 and 100.');$('feature').reportValidity();return;}$('feature').setCustomValidity('');graph.features[selected]=value;invalidate('A feature changed. Run again to see the new result.');};
$('new-case').onclick=()=>{caseIndex=(caseIndex+1)%CASES.length;graph=copyCase(CASES[caseIndex]);$('graph-title').textContent=graph.name;$('extra-edge').checked=graph.edges.some(([a,b])=>a===0&&b===4);invalidate('New graph, same code. Run again to see the result.');};
$('extra-edge').onchange=()=>{graph.edges=graph.edges.filter(([a,b])=>!(a===0&&b===4));if($('extra-edge').checked)graph.edges.push([0,4]);invalidate('The A—E link changed. Run again to see its effect.');};
$('replay').onclick=replay;$('step').onclick=()=>{stopPlayback();animateNode(stepIndex++%5,playToken);};
window.addEventListener('pagehide',()=>{stopPlayback();studentExecutor.dispose('Page closed.');referenceExecutor.dispose('Page closed.');});
$('hint').textContent=STAGES.sum.hint;draw();
