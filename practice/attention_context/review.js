/* Authoring source for optional spiral reviews. No storage or telemetry. */
(() => {
'use strict';
const M=window.reviewModel, $=s=>document.querySelector(s);
let recovery=false, reviewDone=false, freshDone=false, hints=0, freshHelp=false, freshStarted=false, openingActive=!!M.opening;
function el(tag,attrs={},text){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
function table(data){if(!data)return null;const t=el('table');t.append(el('caption',{},data.caption));const h=el('thead'),r=el('tr');data.headers.forEach(x=>r.append(el('th',{scope:'col'},x)));h.append(r);t.append(h);const b=el('tbody');data.rows.forEach(row=>{const r=el('tr');row.forEach((x,i)=>r.append(el(i?'td':'th',i?{}:{scope:'row'},String(x))));b.append(r);});t.append(b);return t;}
const multiple=q=>q.type==='checkbox'||q.type==='sources'||q.type==='cells'||q.type==='factors';
function question(q){
 const g=el('fieldset',{class:'question','data-question':q.id});g.append(el('legend',{},q.prompt));
 if(q.displayTable)g.append(table(q.displayTable));
 if(q.components){const diagram=el('div',{class:'component-setup'});for(const [name,terms] of q.components){const row=el('div',{class:'component-row'});row.append(el('span',{class:'component-name'},name+' ='));terms.forEach((t,i)=>{if(i)row.append(el('span',{},'+'));row.append(el('span',{class:t==='B'&&!q.componentsNeutral?'component shared-component':'component','data-term':t},t));});diagram.append(row);}g.append(diagram);}
 if(q.presentation==='estimate-choice')window.reviewVisuals.estimates(g,q);
 if(q.type==='number'){
  const label=el('label',{class:'number-label'},q.label||'Value'),entry=el('span',{class:'entry'});
  if(q.before)entry.append(el('span',{class:'equation-part'},q.before));
  entry.append(el('input',{id:q.id,type:'text',inputmode:'decimal',autocomplete:'off','aria-describedby':'number-note feedback-'+q.id}));if(q.after)entry.append(el('span',{class:'equation-part'},q.after));if(q.unit)entry.append(el('span',{},q.unit));label.append(entry);g.append(label);
 }else{
  if(multiple(q)){
   const keys=q.options.map(o=>o[0]);
   if(!Array.isArray(q.answer)||!q.answer.length||new Set(q.answer).size!==q.answer.length||new Set(keys).size!==keys.length||q.answer.some(k=>!keys.includes(k))||keys.some(k=>!q.answer.includes(k)&&!q.misconceptions?.[k]))throw Error('Invalid select-all question: '+q.id);
   g.append(el('p',{class:'note checkbox-note',id:'select-note-'+q.id},q.type==='sources'?'Mark the sources to exclude. Select again to restore one.':q.type==='cells'?'Select cells to retain them. Select again to release them.':q.type==='factors'?'Select two cells to form the contribution.':'Select all that apply.'));
  }
  const choices=el('div',{class:q.type==='sources'?'choices source-row':q.type==='cells'?'choices cell-grid':q.presentation==='posterior'?'choices posterior-choices':q.presentation==='component-pick'?'choices component-picks':'choices'});const factorCells=[];
  if(q.type==='factors'){
   const t=el('table',{class:'factor-table'});t.append(el('caption',{},q.referenceTable.caption));const head=el('tr');q.referenceTable.headers.forEach(h=>head.append(el('th',{scope:'col'},h)));const th=el('thead');th.append(head);t.append(th);const tb=el('tbody');
   q.referenceTable.rows.forEach(row=>{const tr=el('tr');tr.append(el('th',{scope:'row'},String(row[0])));for(let j=1;j<row.length;j++){const td=el('td');tr.append(td);factorCells.push(td);}tb.append(tr);});t.append(tb);choices.append(t);
  }
  q.options.forEach(([value,text],index)=>{const label=el('label',{class:'choice'}),attrs={type:multiple(q)?'checkbox':'radio',name:q.id,value};if(multiple(q))attrs['aria-describedby']='select-note-'+q.id+' feedback-'+q.id;if(q.type==='factors'){label.classList.add('factor-choice');attrs['aria-label']=text;label.append(el('input',attrs),el('span',{},String(q.factorValues[index])+(index%3===2?' cm':'')));
   }else if(q.type==='cells'){
    label.classList.add('cell-tile');label.dataset.cell=value;const i=q.options.findIndex(o=>o[0]===value);label.append(el('input',attrs),el('span',{class:'cell-coordinate'},'X = '+Math.floor(i/2)+', Y = '+(i%2)),el('span',{class:'cell-probability'},q.weights[i].toFixed(2)));
   }else if(q.presentation==='posterior'){
    const i=q.options.findIndex(o=>o[0]===value);label.classList.add('posterior-option');label.append(el('input',attrs),el('span',{class:'posterior-column','aria-hidden':'true',style:'height:'+(q.probabilities[i]*160)+'px'}),el('span',{},'θ = '+q.values[i]),el('span',{class:'note'},'P = '+q.probabilities[i].toFixed(2)));
   }else if(q.type==='sources'){
    label.classList.add('source-card');label.dataset.source=value;
    if(Number(value)===q.query)label.classList.add('query-source');
    const content=el('span',{class:'source-content'});content.append(el('span',{class:'source-position'},'Source '+value),el('span',{class:'source-weight'},q.weights[Number(value)-1].toFixed(2)),el('span',{class:'source-mark'},'Excluded'));
    if(Number(value)===q.query)content.append(el('span',{class:'query-tag'},'Query here'));
    label.append(el('input',attrs),content);
   }else label.append(el('input',attrs),document.createTextNode(text));if(q.type==='factors')factorCells[index].append(label);else choices.append(label);});g.append(choices);
  if(q.presentation==='estimate-choice'){
   const out=el('p',{role:'status',class:'estimate-readout'});g.append(out);
   choices.addEventListener('input',()=>{const selected=choices.querySelector('input:checked')?.value,index=q.support.indexOf(Number(selected)),score=index<0?0:q.posterior[index];out.textContent='Exact-match probability for estimate '+selected+': '+score.toFixed(2)+'.';for(const marker of g.querySelectorAll('[data-estimate]'))marker.classList.toggle('selected-estimate',marker.dataset.estimate===selected);});
  }
  if(q.presentation==='component-pick'){
   const out=el('p',{role:'status',class:'component-readout'});g.append(out);
   choices.addEventListener('input',()=>{const selected=choices.querySelector('input:checked')?.value;let count=0;for(const term of g.querySelectorAll('[data-term]')){const match=term.dataset.term===selected;term.classList.toggle('shared-component',match);if(match)count++;}out.textContent=selected+' occurs '+count+' '+(count===1?'time':'times')+' across the two expressions.';});
  }
  if(q.type==='factors'){
   const out=el('p',{role:'status',class:'factor-product'});g.append(out);
   function product(){const selected=[...choices.querySelectorAll('input:checked')].map(e=>q.factorValues[q.options.findIndex(o=>o[0]===e.value)]);out.textContent=selected.length?'Selected product: '+selected.map(x=>Number(x.toFixed(2))).join(' × ')+' = '+Number(selected.reduce((a,b)=>a*b,1).toFixed(4)):'No factors selected.';}
   choices.addEventListener('input',product);product();
  }
  if(q.type==='sources'||q.type==='cells'){
   const readout=el('p',{class:'retained-total',role:'status'});g.append(readout);
   function total(){const selected=[...choices.querySelectorAll('input:checked')].map(e=>e.value);const sum=q.weights.reduce((a,x,i)=>a+(q.type==='cells'?(selected.includes(q.options[i][0])?x:0):(selected.includes(String(i+1))?0:x)),0);readout.textContent=(q.type==='cells'?'Retained probability: ':'Retained weight: ')+sum.toFixed(2);}
   choices.addEventListener('input',total);total();
  }
 }
 g.append(el('p',{id:'feedback-'+q.id,class:'feedback',role:'status'}));return g;
}
function numeric(raw){const parts=raw.trim().split('/');if(parts.length>2)return NaN;const decimal=s=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s.trim())?Number(s):NaN;const a=decimal(parts[0]);if(parts.length===1)return a;const b=decimal(parts[1]);return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?a/b:NaN;}
function value(q){if(q.type==='number')return numeric($('#'+q.id).value);if(multiple(q))return [...document.querySelectorAll('input[name="'+q.id+'"]:checked')].map(e=>e.value);return document.querySelector('input[name="'+q.id+'"]:checked')?.value;}
function blank(q){if(q.type==='number')return !$('#'+q.id).value.trim();if(multiple(q))return value(q).length===0;return value(q)===undefined;}
function good(q,v){if(q.type==='number')return Number.isFinite(v)&&Math.abs(v-q.answer)<=.005;if(multiple(q))return v.length===q.answer.length&&q.answer.every(k=>v.includes(k));return v===q.answer;}
function retry(q,v){
 if(!multiple(q))return q.retry||'Recheck the distinction this question asks about.';
 const messages=v.filter(k=>!q.answer.includes(k)).map(k=>q.misconceptions[k]);
 if(q.answer.some(k=>!v.includes(k)))messages.push(q.type==='sources'?'An excluded source is still unmarked.':q.type==='cells'?'A matching case is still unmarked.':q.type==='factors'?'A needed factor is still unselected.':'A supported conclusion is still unselected.');
 return messages.join(' ');
}
function choiceText(q,v){return q.options.filter(([k])=>multiple(q)?v.includes(k):k===v).map(o=>o[1]).join('; ');}

function feedback(id,text,kind){const e=$('#'+id);e.textContent=text;e.dataset.kind=kind;}
function outcome(){if(M.freshOptional){
 const done=freshStarted?freshDone:reviewDone;$('#outcome').hidden=!done;$('#outcome h2').textContent=done?'Practice checked.':'';
 $('#outcome-text').textContent=done?(freshDone?(freshHelp?'The fresh-case answers are correct, with the explanation available.':'The fresh-case answers are correct. Continue with the unit whenever you are ready.'):(recovery?'These answers are correct, with the reminder available. Continue with the unit, or try a fresh case.':'These answers are correct. Continue with the unit, or try a fresh case.')):'';
 $('#open-transfer').hidden=!(recovery||reviewDone||freshStarted);$('#open-transfer').textContent='Try a fresh case';return;
 }const completed=freshDone||(reviewDone&&!recovery);$('#outcome').hidden=!(reviewDone||freshDone);$('#outcome h2').textContent=completed?'Review complete.':reviewDone?'Fresh case still to do.':'';$('#outcome-text').textContent=freshDone?(freshHelp?'The fresh-case answers are correct, with the explanation available.':'The fresh-case answers are correct. Continue with the unit whenever you are ready.'):reviewDone?(recovery?'Complete the fresh case after using the reminder or revising a wrong answer.':'The diagnostic answers are correct. Continue with the unit, or try a fresh case.'):'';$('#open-transfer').hidden=!(recovery||reviewDone||freshDone);$('#open-transfer').textContent='Try a fresh case';}
function recover(){recovery=true;outcome();review.refresh();}
function solutionSoFar(steps,current,prefix,done){
 const body=$('#'+(prefix==='review'?'worked-body':'fresh-worked-body'));body.replaceChildren();
 if((prefix==='review'&&openingActive)||(prefix==='fresh'&&!freshStarted)){
  body.append(el('p',{},'Start a question to see its solution.'));return;
 }
 for(const step of steps.slice(0,done?steps.length:current+1))for(const q of step.questions){
  const section=el('section',{'data-solution-for':q.id});section.append(el('h3',{},q.short||q.prompt));
  const text=q.worked||q.correct?.replace(/^Correct\.\s*/,'');
  if(!text)throw Error('Missing question solution: '+q.id);
  for(const paragraph of Array.isArray(text)?text:[text])section.append(el('p',{},paragraph));
  body.append(section);
 }
}
function stage(spec,prefix){const mount=$('#'+(prefix==='review'?'review':'fresh')+'-questions'),form=$('#'+prefix+'-form');mount.append(el('p',{class:'stage-intro'},spec.intro));const t=table(spec.table||spec.questions[0].referenceTable);let data=null,dataRevealed=false;if(t){data=el('details',{class:'case-data'});data.append(el('summary',{},'View the case data'),t);mount.append(data);}
 const steps=[];spec.questions.forEach(q=>{const prev=steps[steps.length-1];if(q.step&&prev&&prev.key===q.step)prev.questions.push(q);else steps.push({key:q.step||q.id,questions:[q]});});
 let current=0,accepted=false,done=false;
 steps.forEach((s,i)=>{s.root=el('div',{class:'step','data-step':String(i)});s.summary=el('details',{class:'checked-answer',hidden:''});s.caption=el('summary');s.summary.append(s.caption);s.responses=el('div',{class:'answer-record'});s.summary.append(s.responses);const edit=el('button',{type:'button',class:'text-button'},'Revise answer');edit.addEventListener('click',()=>{invalidate(i);focusQuestion();});s.summary.append(edit);s.body=el('div',{class:'step-body'});s.questions.forEach(q=>s.body.append(question(q)));s.root.append(s.summary,s.body);mount.append(s.root);});
 const checkButton=form.querySelector('button[type=submit]');checkButton.textContent='Check answer';const next=el('button',{type:'button',class:'next-step',hidden:''},'Continue');checkButton.after(next);
 const visual=prefix==='review'&&M.visual?window.reviewVisuals.create({config:M.visual,mount,table:t,support:()=>{recover();render();}}):null;
 function clearCompletion(){if(prefix==='review'&&freshDone)fresh.invalidate();freshDone=false;if(prefix==='review')reviewDone=false;outcome();}
 function invalidate(index){current=index;accepted=false;done=false;clearCompletion();for(let i=index;i<steps.length;i++){steps[i].summary.open=false;steps[i].questions.forEach(q=>{const g=document.querySelector('[data-question="'+q.id+'"]');g.querySelector('.feedback').textContent='';g.querySelectorAll('input').forEach(e=>e.removeAttribute('aria-invalid'));});}$('#'+prefix+'-feedback').textContent='';render();}
 function record(s){const brief=s.questions.map(q=>{const v=value(q);return q.type==='number'?(s.questions.length>1?(q.id.includes('sd')?'SD: ':'SE: '):'')+$('#'+q.id).value+(q.unit?' '+q.unit:''):choiceText(q,v);}).join('; ');s.caption.textContent=(s.questions[0].short||s.questions[0].prompt)+' · '+brief;s.responses.replaceChildren();s.questions.forEach(q=>{const v=value(q),text=q.type==='number'?$('#'+q.id).value+(q.unit?' '+q.unit:''):choiceText(q,v);s.responses.append(el('p',{},q.prompt),el('p',{class:'record-value'},text),el('p',{},q.correct||'Correct.'));});}
 function render(){solutionSoFar(steps,current,prefix,done);if(prefix==='review'){const title=$('#review-title'),section=form.closest('section.card');title.hidden=current>0||done||(M.opening&&!openingActive);if(title.hidden){section.removeAttribute('aria-labelledby');section.setAttribute('aria-label','Review questions');}else{section.removeAttribute('aria-label');section.setAttribute('aria-labelledby','review-title');}}if(data&&spec.questions[0].type==='factors')data.hidden=current===0;if(data&&current>0&&!dataRevealed){data.open=true;dataRevealed=true;}steps.forEach((s,i)=>{const past=i<current||done;s.root.hidden=i>current&&!done;s.summary.hidden=!past;s.body.hidden=past;if(past)record(s);});checkButton.hidden=accepted||done||(prefix==='review'&&openingActive);next.hidden=!accepted||done||(prefix==='review'&&openingActive);if(prefix==='review')mount.hidden=openingActive;if(visual){const checked=new Set(steps.flatMap((s,i)=>(i<current||done||(i===current&&accepted))?s.questions.map(q=>q.id):[]));const parent=done?mount:steps[current].body;if(visual.root.parentNode!==parent)parent.append(visual.root);visual.update({checked,current:steps[current].questions.map(q=>q.id),recovery,supportOpen:!$('#support').hidden});}const note=form.querySelector('#number-note');if(note)note.hidden=done||(prefix==='review'&&openingActive)||!steps[current].questions.some(q=>q.type==='number');}
 function focusQuestion(){const g=steps[current].body.querySelector('fieldset');g.setAttribute('tabindex','-1');g.focus();}
 form.addEventListener('input',e=>{if(!e.target.closest('[data-question]'))return;invalidate(current);});
 next.addEventListener('click',()=>{if(!accepted||done)return;current++;accepted=false;$('#'+prefix+'-feedback').textContent='';render();focusQuestion();});
 form.addEventListener('submit',e=>{e.preventDefault();if(done)return;let all=true,wrong=false;for(const q of steps[current].questions){const v=value(q),ok=good(q,v),missing=blank(q),invalid=q.type==='number'&&!missing&&!Number.isFinite(v);all=all&&ok;wrong=wrong||(!ok&&!missing&&!invalid);feedback('feedback-'+q.id,missing?(q.type==='number'?'Enter a value.':multiple(q)?(q.type==='sources'?'Mark a source to exclude.':q.type==='cells'?'Mark a case to retain.':q.type==='factors'?'Select factors for the contribution.':'Choose at least one statement.'):'Choose an answer.'):invalid?'Enter a decimal or a fraction with a nonzero denominator.':ok?(q.correct||'Correct.'):retry(q,v),ok?'success':'retry');const g=document.querySelector('[data-question="'+q.id+'"]');g.querySelectorAll('input').forEach(input=>{if(ok||missing)input.removeAttribute('aria-invalid');else input.setAttribute('aria-invalid','true');});}
 if(prefix==='review'&&wrong){recover();$('#support').hidden=false;$('#help').setAttribute('aria-expanded','true');}
 accepted=all;if(all&&current===steps.length-1){done=true;if(prefix==='review'){reviewDone=true;$('#support').hidden=true;$('#help').setAttribute('aria-expanded','false');}else freshDone=true;outcome();}
 feedback(prefix+'-feedback',all?(done?(prefix==='fresh'&&freshHelp?'Fresh-case answers are correct, with the explanation available.':'All answers in this case are correct.'):''):'',all?'success':'retry');render();if(all&&done){$('#outcome h2').setAttribute('tabindex','-1');$('#outcome h2').focus();}else if(all)next.focus();
 });render();return {invalidate:()=>invalidate(current),refresh:render};
}
$('#page-title').textContent=M.title;document.title=M.title+' · Spiral review';$('#intro').textContent=M.intro;if(M.helpLabel)$('#help').textContent=M.helpLabel;$('#review-title').textContent=M.reviewTitle;$('#fresh-title').textContent=M.freshTitle;
const review=stage(M.diagnostic,'review'),fresh=stage(M.fresh,'fresh');
if(M.opening){const panel=el('div',{class:'opening-panel'});const mount=$('#review-questions');mount.before(panel);window.reviewVisuals.opening(panel,M.opening);const begin=el('button',{type:'button',id:'begin-practice'},'Try a question');panel.append(begin);begin.addEventListener('click',()=>{openingActive=false;panel.hidden=true;review.refresh();const field=mount.querySelector('fieldset');field.setAttribute('tabindex','-1');field.focus();});}
if(M.reminder)$('#support').prepend(el('p',{class:'method-reminder'},M.reminder));

$('#help').addEventListener('click',()=>{recover();$('#support').hidden=!$('#support').hidden;$('#help').setAttribute('aria-expanded',String(!$('#support').hidden));review.refresh();});
$('#hint').addEventListener('click',()=>{recover();if(hints<M.hints.length)$('#hints').append(el('p',{class:'hint'},M.hints[hints++]));$('#hint').disabled=hints===M.hints.length;$('#hint').textContent=hints===M.hints.length?'Hints shown':'Show next hint';});
for(const id of ['#worked','#glossary'])$(id).addEventListener('toggle',e=>{if(e.target.open)recover();});
if(M.connection){const detail=el('details');detail.append(el('summary',{},M.connection.title),el('p',{},M.connection.text));$('#glossary').after(detail);detail.addEventListener('toggle',()=>{if(detail.open)recover();});}
$('#open-transfer').addEventListener('click',()=>{freshStarted=true;outcome();$('#fresh').hidden=false;fresh.refresh();$('#fresh-title').focus();});
$('#fresh-worked').addEventListener('toggle',e=>{if(e.target.open){freshHelp=true;fresh.invalidate();}});
$('#reset').addEventListener('click',()=>location.reload());
})();
