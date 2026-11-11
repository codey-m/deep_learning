import {CASES,ROLE,STARTER,copyCase,format,indentSelection} from './model.mjs';
import {PythonExecutor} from './execution.mjs';
const $=id=>document.getElementById(id);
let caseIndex=0,conv=copyCase(CASES[0]),selected=null,version=0,last=null,busy=false,activeExecutor=null,shiftToken=0;
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const restartReference=new URLSearchParams(location.search).has('restart_reference');
$('code').value=STARTER;

function runtimeStatus(owner,{state,message}){
 if(activeExecutor!==owner)return;
 $('runtime').textContent=message;$('retry').hidden=state!=='error';
 for(const id of ['run','suite','reference'])$(id).disabled=busy||state==='loading';
 $('stop').disabled=!busy&&state!=='loading';
}
function reportMetrics(m){window.dispatchEvent(new CustomEvent('python-run-measured',{detail:{...m,mode:m.role,implementation:restartReference?'forced-restart':'warm-reuse'}}));}
const studentExecutor=new PythonExecutor({role:'student',onStatus:s=>runtimeStatus(studentExecutor,s),onMetrics:reportMetrics});
const referenceExecutor=new PythonExecutor({role:'reference',onStatus:s=>runtimeStatus(referenceExecutor,s),onMetrics:reportMetrics});

const n=()=>conv.roles.length;
const isReference=()=>last?.request.mode==='reference';
const shownMask=()=>last?.result.mask??null;
function ownRoleMask(){return conv.roles.map(r=>r==='assistant'?1:0).slice(0,-1);}
const an=r=>`${r==='assistant'?'an':'a'} ${ROLE[r].name}`;
function el(tag,attrs={},text){const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
function roleCell(role,loss,label){
 const cell=el('div',{class:`cell role ${role}`,'aria-label':label});
 cell.append(el('span',{class:'letter','aria-hidden':'true'},ROLE[role].letter),el('span',{class:'loss','aria-hidden':'true'},format(loss)));
 return cell;
}
// Row labels have a short form for narrow screens; the full label stays available to assistive technology.
const SHORT={'Token':'Tok','Predicts':'Next','Your mask':'Mask','Reference mask':'Ref','Own role':'Own'};
function row(label,cls){const tr=el('tr',{class:cls}),th=el('th',{scope:'row','aria-label':label});th.append(el('span',{class:'long','aria-hidden':'true'},label),el('span',{class:'short','aria-hidden':'true'},SHORT[label]||label));tr.append(th);return tr;}
function selCls(i){return i===selected?'selected-col':'';}

// Draw the table. `animate` plays the shift: the target row starts aligned with its own token, then moves one position left.
function draw(animate=false){
 const head=$('grid').tHead,body=$('grid').tBodies[0];head.replaceChildren();body.replaceChildren();
 const hr=el('tr'),pos=el('th',{scope:'col','aria-label':'Position'});pos.append(el('span',{class:'long','aria-hidden':'true'},'Position'),el('span',{class:'short','aria-hidden':'true'},'#'));hr.append(pos);
 conv.roles.forEach((_,i)=>{const th=el('th',{scope:'col',class:selCls(i)});const b=el('button',{'aria-pressed':String(i===selected),'aria-label':`Inspect position ${i}`},String(i));b.onclick=()=>inspect(i);th.append(b);hr.append(th);});
 head.append(hr);
 const tokens=row('Token','tokens');
 conv.roles.forEach((r,i)=>{const td=el('td',{class:selCls(i)});td.append(roleCell(r,conv.losses[i],`Token ${i}: ${ROLE[r].name}, loss ${format(conv.losses[i])}`));tokens.append(td);});
 body.append(tokens);
 const mask=shownMask();
 if(mask){
  const play=animate&&!reducedMotion();
  const target=row('Predicts',`target ${play?'unshifted':''}`);
  for(let i=0;i<n()-1;i++){const td=el('td',{class:selCls(i)});const r=conv.roles[i+1];td.append(roleCell(r,conv.losses[i+1],`Position ${i} predicts token ${i+1}: ${ROLE[r].name}, loss ${format(conv.losses[i+1])}`));target.append(td);}
  target.append(el('td',{class:`empty ${selCls(n()-1)}`,'aria-label':'Nothing follows the last token'},'—'));
  body.append(target);
  const source=isReference()?'Reference mask':'Your mask';
  const maskRow=row(source,`mask ${isReference()?'reference':''} ${play?'hidden':''}`);
  mask.forEach((m,i)=>{const td=el('td',{class:selCls(i)});td.append(el('div',{class:`cell ${m?'on':''}`,'aria-label':`${source} at position ${i}: ${m}`},String(m)));maskRow.append(td);});
  maskRow.append(el('td',{class:`empty ${selCls(n()-1)}`},''));
  body.append(maskRow);
  if($('compare').checked){
   const own=ownRoleMask(),ownRow=row('Own role','own');
   own.forEach((m,i)=>{const diff=m&&!mask[i]?'adds':!m&&mask[i]?'loses':'';const td=el('td',{class:selCls(i)});td.append(el('div',{class:`cell ${m?'on':''} ${diff}`,'aria-label':`Own-role mask at position ${i}: ${m}${diff==='adds'?', adds a target':diff==='loses'?', drops a target':''}`},String(m)));ownRow.append(td);});
   ownRow.append(el('td',{class:`empty ${selCls(n()-1)}`},''));body.append(ownRow);
  }
  if(play){const token=++shiftToken;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==shiftToken)return;target.classList.remove('unshifted');maskRow.classList.remove('hidden');}));}
 }
 describe();
 $('input-code').textContent=`roles = ${JSON.stringify(conv.roles)}\nlosses = ${JSON.stringify(conv.losses)}\ntargets = losses[1:]`;
}
function describe(){
 const i=selected;if(i===null){$('inspect').textContent='Select a position number to inspect it.';return;}
 const r=conv.roles[i];let text=`Position ${i} holds ${an(r)} token (loss ${format(conv.losses[i])}).`;
 const mask=shownMask();
 if(mask){
  if(i===n()-1)text+=' It is the last token: nothing follows it, so it predicts nothing and has no mask entry.';
  else{const t=conv.roles[i+1];text+=` It predicts token ${i+1}, ${an(t)} token with loss ${format(conv.losses[i+1])}. ${isReference()?'Reference':'Your'} mask here: ${mask[i]}.`;
   if($('compare').checked)text+=` Own-role mask: ${ownRoleMask()[i]}.`;}
 }
 $('inspect').textContent=text;
}
function inspect(i){selected=i;draw();$('grid').tHead.querySelectorAll('button')[i]?.focus();}
function feedback(text,kind=''){$('result-panel').hidden=false;$('verdict').textContent=text;$('verdict').className=kind;}

function reportText(result){
 const mask=result.mask;if(!mask)return '';
 const targets=conv.losses.slice(1),picked=mask.map((m,i)=>m?i:null).filter(i=>i!==null);
 const pickedLoss=picked.map(i=>targets[i]),sum=pickedLoss.reduce((a,b)=>a+b,0);
 const meanAll=targets.reduce((a,b)=>a+b,0)/targets.length;
 const who=isReference()?'The reference mask':'Your mask';
 const lines=[`${who} selects ${picked.length} of ${targets.length} targets${picked.length?`: positions ${picked.join(', ')}`:''}.`];
 if(picked.length)lines.push(`Sum over the selected targets: ${pickedLoss.map(format).join(' + ')} = <span class="num">${format(sum)}</span>`);
 if(result.mean_own!==null)lines.push(`${isReference()?'Reference':'Your'} <code>supervised_mean_nll</code> on this mask: <span class="num">${format(result.mean_own)}</span>`);
 else if(result.mean_own_error)lines.push('Your <code>supervised_mean_nll</code> raised an error on this mask (see below).');
 lines.push(`For comparison, the mean over every target: <span class="num">${format(meanAll)}</span>`);
 return lines.map(l=>`<p>${l}</p>`).join('');
}
function compareText(){
 const mask=shownMask();if(!mask||!$('compare').checked)return '';
 const own=ownRoleMask(),adds=[],loses=[];
 own.forEach((m,i)=>{if(m&&!mask[i])adds.push(i);if(!m&&mask[i])loses.push(i);});
 const name=i=>`${i} (predicts ${an(conv.roles[i+1])} token)`;
 if(!adds.length&&!loses.length)return 'The own-role mask selects the same targets as the mask above on this conversation.';
 return `Compared with the mask above, the own-role mask adds ${adds.length?`position${adds.length>1?'s':''} ${adds.map(name).join(', ')}`:'nothing'} and drops ${loses.length?`position${loses.length>1?'s':''} ${loses.map(name).join(', ')}`:'nothing'}. Red underline: added; blue overline: dropped.`;
}
function showResult(result,request,animate=true){
 last={result,request};const reference=request.mode==='reference';
 $('run-label').textContent=reference?'Reference result · current conversation':'Your result · current code and conversation';
 const errors=[result.error,result.mask_error&&`target_mask:\n${result.mask_error}${result.returned_mask?`\nReturned: ${result.returned_mask}`:''}`,result.mean_error&&`supervised_mean_nll:\n${result.mean_error}`,result.mean_own_error&&`supervised_mean_nll on your mask:\n${result.mean_own_error}`].filter(Boolean);
 $('error-box').hidden=!errors.length;$('error').textContent=errors.join('\n\n');
 const parts=[];let kind='fail';
 if(reference)parts.push('Reference run complete. The mask and mean shown are this rule’s. Your code is unchanged.'),kind='';
 else if(result.error)parts.push('The code did not run. Read the error below.');
 else{
  if(result.mask_error)parts.push('target_mask did not return a usable mask.');
  else if(!result.mask_ok){const k=result.mask_matches.filter(ok=>!ok).length;parts.push(`Your mask differs from this rule at ${k} of ${result.mask.length} targets. Inspect positions to compare what each one predicts with your mask.`);}
  if(result.mean_error)parts.push('supervised_mean_nll raised an error.');
  else if(!result.mean_ok)parts.push('On the rule’s own selection, your supervised_mean_nll does not return the mean of the selected losses.');
  if(result.mutated)parts.push('A function changed its inputs; leave roles, losses and the mask unchanged.');
  if(result.passed)parts.push('Both functions match this rule on this conversation. Test other conversations to check what generalizes.'),kind='pass';
 }
 feedback(parts.join(' '),kind);
 $('report').innerHTML=reportText(result);
 $('stdout-details').hidden=!result.stdout;$('stdout').textContent=result.stdout;
 $('test-details').hidden=!result.suite;
 if(result.suite){
  const passed=result.suite.filter(r=>r.passed).length;$('test-summary').textContent=`Other conversations: ${passed} of ${result.suite.length} checks passed`;
  $('test-results').replaceChildren();
  for(const r of result.suite){
   const why=r.passed?'both functions match the rule':r.error?r.error.split('\n').filter(Boolean).slice(-1)[0]:[r.mask_ok?null:`mask differs at ${r.mask_wrong} target${r.mask_wrong===1?'':'s'}`,r.mean_ok?null:'mean differs',r.mutated?'inputs changed':null].filter(Boolean).join('; ');
   $('test-results').append(el('div',{class:`test-row ${r.passed?'match':'mismatch'}`},`${r.passed?'✓':'≠'} ${r.name}: ${why}`));
  }
  $('test-details').open=true;
 }
 $('replay').disabled=!result.mask;$('compare').disabled=!result.mask;
 updateCompare();draw(animate&&Boolean(result.mask));
}
function updateCompare(){const t=compareText();$('compare-note').hidden=!t;$('compare-note').textContent=t;}
function clearDisplay(message){
 version++;++shiftToken;
 if(busy){busy=false;if(activeExecutor&&!activeExecutor.isLoading)activeExecutor.cancel();}
 last=null;$('run-label').textContent=message;$('result-panel').hidden=true;
 for(const id of ['error-box','test-details','stdout-details','compare-note'])$(id).hidden=true;
 $('replay').disabled=true;$('compare').disabled=true;
 draw();
}
async function run(suite=false,mode='student'){
 if(busy)return;busy=true;const runVersion=version;
 const request={case:copyCase(conv),suite,mode};if(mode==='student')request.code=$('code').value;
 activeExecutor=mode==='reference'?referenceExecutor:studentExecutor;
 if(mode==='reference'&&restartReference)referenceExecutor.dispose('Developer baseline: restart reference worker.');
 last=null;$('result-panel').hidden=true;$('run-label').textContent=mode==='reference'?'Running reference…':'Running your code…';$('replay').disabled=true;$('compare').disabled=true;draw();
 for(const id of ['run','suite','reference'])$(id).disabled=true;$('stop').disabled=false;
 try{const result=await activeExecutor.run(request,{isCurrent:()=>version===runVersion});if(version===runVersion)showResult(result,request);}
 catch(error){if(version===runVersion&&!error.superseded){last=null;feedback(error.message,'fail');$('run-label').textContent='Run stopped';draw();}}
 finally{if(version===runVersion){busy=false;for(const id of ['run','suite','reference'])$(id).disabled=false;$('stop').disabled=true;}}
}
function lines(){const e=$('code');$('line-numbers').textContent=e.value.split('\n').map((_,i)=>i+1).join('\n');$('line-numbers').scrollTop=e.scrollTop;}
// Reference output depends only on the displayed conversation, so code edits keep it (and any reference run in progress).
const referenceShown=()=>activeExecutor===referenceExecutor&&(busy||isReference());
$('code').oninput=()=>{lines();if(!referenceShown())clearDisplay('Code changed. Run again to see its result.');};
$('code').onscroll=lines;
let escapeTab=false;
$('code').onkeydown=event=>{
 if(event.key==='Escape'){escapeTab=true;return;}
 if(event.key==='Tab'&&!event.shiftKey&&!escapeTab){event.preventDefault();const e=$('code'),c=indentSelection(e.value,e.selectionStart,e.selectionEnd);e.value=c.text;e.setSelectionRange(c.start,c.end);e.dispatchEvent(new Event('input'));}
 else if(event.key!=='Shift')escapeTab=false;
 if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}
};
$('code').onblur=()=>{escapeTab=false;};
$('run').onclick=()=>run();$('suite').onclick=()=>run(true);$('reference').onclick=()=>run(false,'reference');
$('stop').onclick=()=>{const executor=activeExecutor;clearDisplay('Stopped. Your code is preserved. Run again when you are ready.');executor?.cancel();};
$('retry').onclick=()=>activeExecutor?.load().catch(()=>{});
$('reset').onclick=()=>{$('code').value=STARTER;lines();clearDisplay('Code reset. Complete both functions, then run.');};
$('new-case').onclick=()=>{caseIndex=(caseIndex+1)%CASES.length;conv=copyCase(CASES[caseIndex]);selected=null;$('conv-title').textContent=conv.name;clearDisplay('New conversation, same code. Run again to see the result.');};
$('replay').onclick=()=>{if(last)draw(true);};
$('compare').onchange=()=>{updateCompare();draw();};
$('download').onclick=()=>{
 const text=`# Instruction masking\nroles = ${JSON.stringify(conv.roles)}\nlosses = ${JSON.stringify(conv.losses)}\n\n${$('code').value}\n\ntargets = losses[1:]\nmask = target_mask(roles)\nprint("mask:", mask)\nprint("supervised mean NLL:", supervised_mean_nll(targets, mask))\n`;
 const url=URL.createObjectURL(new Blob([text],{type:'text/x-python'})),a=document.createElement('a');a.href=url;a.download='instruction-masking.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('pagehide',()=>{studentExecutor.dispose('Page closed.');referenceExecutor.dispose('Page closed.');});
lines();draw();
