/* Small, local mathematical views. Supplied data and text remain usable without a plot. */
(() => {
'use strict';
const NS='http://www.w3.org/2000/svg';let spreadCounter=0;
function el(tag,attrs={},text){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
function svgEl(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
const fmt=x=>Number(x.toFixed(3)).toString();
const math={
 pdf:(x,sd)=>Math.exp(-x*x/(2*sd*sd))/(sd*Math.sqrt(2*Math.PI)),
 meanSD:n=>1/Math.sqrt(n),
 conditional(cells){const total=cells[1]+cells[3];return {mass:total,probabilities:[cells[1]/total,cells[3]/total]};},
 posterior(values,weights){return {mean:values.reduce((a,x,i)=>a+x*weights[i],0),mode:values[weights.indexOf(Math.max(...weights))]};},
 contributions:rows=>rows.map(r=>({name:r.name,event:r.weight*r.prob,mean:r.weight*r.mean}))
};
function plot(title){const svg=svgEl('svg',{viewBox:'0 0 600 240',role:'img','aria-label':title,preserveAspectRatio:'xMidYMid meet'});return svg;}
function axis(svg,x0,y0,x1,y1){svg.append(svgEl('line',{x1:x0,y1:y0,x2:x1,y2:y1,class:'plot-axis'}));}
function spread(root,support,config={}){
 const readoutId='spread-readout-'+(++spreadCounter);
 const detail=el('details',{class:'visual-disclosure'});detail.append(el('summary',{},'Compare individual values and sample means'));
 detail.append(el('p',{},config.qualitative?'Individual draws and repeated sample means from the same normal population. Each mean uses n independent draws.':'Example: a normal population with mean 0 cm and SD 1 cm. Each mean uses n independent draws.'));
 const legend=el('div',{class:'plot-key'});legend.append(el('span',{class:'key-individual'},'Individual values'),el('span',{class:'key-means'},'Sample means'));detail.append(legend);
 const svg=plot('Individual values and sample means on the same horizontal and density scales.');detail.append(svg);
 const label=el('label',{class:'visual-slider'},'Draws in each sample');const slider=el('input',{type:'range',min:'0',max:String((config.samples||[1,2,5,10,20]).length-1),step:'1',value:'1','aria-describedby':readoutId});label.append(slider);detail.append(label);
 const out=el('p',{id:readoutId,class:'visual-readout',role:'status'});detail.append(out);root.append(detail);
 const sizes=config.samples||[1,2,5,10,20];
 function draw(){const n=sizes[Number(slider.value)],sd=math.meanSD(n);slider.setAttribute('aria-valuetext',n+' draws');svg.replaceChildren();const px=x=>48+(x+3.5)/7*520,py=y=>176-y/2*148;axis(svg,48,176,568,176);axis(svg,48,176,48,20);
 for(const x of [-3,-2,-1,0,1,2,3]){axis(svg,px(x),176,px(x),181);svg.append(svgEl('text',{x:px(x),y:200,'text-anchor':'middle'},String(x)));}
 svg.append(svgEl('text',{x:48,y:22},'Density'),svgEl('text',{x:568,y:232,'text-anchor':'end'},'Value (cm)'));
 for(const [spread,cls] of [[1,'individual-curve'],[sd,'mean-curve']]){const points=Array.from({length:421},(_,i)=>{const x=-3.5+7*i/420;return (i?'L':'M')+px(x).toFixed(3)+','+py(math.pdf(x,spread)).toFixed(3);}).join(' ');svg.append(svgEl('path',{d:points,class:cls,'data-sd':String(spread)}));}
 out.textContent=config.qualitative?'n = '+n+' draws per mean. The dashed curve is the same population at every setting.':'n = '+n+' draws. Individual SD: 1 cm. SD of sample means: '+fmt(sd)+' cm.';root.dataset.sampleSize=n;root.dataset.meanSd=sd;root.dataset.individualSd=1;
 }
 detail.addEventListener('toggle',()=>{if(detail.open)support();});slider.addEventListener('input',()=>{support();draw();});draw();
 return {update:s=>{root.hidden=!s.checked.has('means');},open:()=>{detail.open=true;}};
}
function conditioning(root,config,support,table){
 const result=math.conditional(config.cells);let rescaled=false;
 root.append(el('p',{class:'visual-title'},'Retain the alert cases'));
 root.append(el('p',{},'Conditioning on Y = 1 keeps the alert column.'));
 const button=el('button',{type:'button',class:'text-button'},'Rescale the retained probabilities');root.append(button);
 const normalized=el('div',{class:'normalized-probabilities',hidden:''});
 result.probabilities.forEach((p,i)=>{const row=el('div',{class:'probability-row'});row.append(el('span',{},'X = '+i),el('span',{class:'probability-bar','aria-hidden':'true',style:'--portion:'+p}),el('span',{},fmt(p)));normalized.append(row);});normalized.append(el('p',{},'Retained mass: '+fmt(result.mass)+'. Dividing each retained cell by this mass makes the probabilities sum to 1.'));root.append(normalized);
 let checked=new Set(),previousConditional=false;button.addEventListener('click',()=>{if(!checked.has('conditional'))support();rescaled=true;normalized.hidden=false;button.hidden=true;});
 return {update:s=>{checked=s.checked;if(previousConditional&&!checked.has('conditional')){rescaled=false;button.hidden=false;}previousConditional=checked.has('conditional');const show=checked.has('condition');root.hidden=!show;
 if(table){Array.from(table.rows).forEach((row,i)=>Array.from(row.cells).forEach((cell,j)=>{const keep=show&&j===2;cell.classList.toggle('retained-cell',keep);if(keep)cell.setAttribute('aria-label',(i?'Retained alert case: ':'Known alert: ')+cell.textContent);else cell.removeAttribute('aria-label');}));}
 normalized.hidden=!rescaled;},open:()=>button.click()};
}
function variance(root){
 root.append(el('p',{class:'visual-title'},'Follow the shared component'));
 const rows=[['X',['A','B']],['Y',['B','C']],['X + Y',['A','2B','C']]];
 for(const [name,terms] of rows){const row=el('div',{class:'component-row'});row.append(el('span',{class:'component-name'},name+' ='));terms.forEach((term,i)=>{if(i)row.append(el('span',{},'+'));row.append(el('span',{class:term.includes('B')?'component shared-component':'component'},term));});root.append(row);}
 root.append(el('p',{},'The same B appears in both sums, so it has coefficient 2 in X + Y.'));
 const button=el('button',{type:'button',class:'text-button'},'Show the average'),average=el('p',{class:'average-equation',hidden:''},'(X + Y)/2 = A/2 + B + C/2');root.append(button,average);
 button.addEventListener('click',()=>{average.hidden=false;button.hidden=true;});
 return {update:s=>{root.hidden=!(s.recovery&&s.supportOpen&&s.current.some(id=>['cross','sum','average','error'].includes(id)));},open:()=>button.click()};
}
function posterior(root,config){
 const m=math.posterior(config.values,config.weights),svg=plot('Posterior probability at each possible value, with the MAP and posterior mean marked.');
 const low=Math.min(...config.values)-1,high=Math.max(...config.values)+1,px=x=>48+(x-low)/(high-low)*520,py=p=>166-p/.6*130;
 axis(svg,48,166,568,166);axis(svg,48,166,48,20);
 for(const p of [0,.25,.5]){svg.append(svgEl('text',{x:39,y:py(p)+5,'text-anchor':'end'},fmt(p)));}
 config.values.forEach((v,i)=>{svg.append(svgEl('line',{x1:px(v),x2:px(v),y1:166,y2:py(config.weights[i]),class:'posterior-stick','data-value':v,'data-probability':config.weights[i]}),svgEl('circle',{cx:px(v),cy:py(config.weights[i]),r:5,class:'posterior-dot'}),svgEl('text',{x:px(v),y:190,'text-anchor':'middle'},fmt(v)));});
 svg.append(svgEl('text',{x:48,y:22},'Probability'),svgEl('text',{x:568,y:232,'text-anchor':'end'},'θ'));
 svg.append(svgEl('line',{x1:px(m.mean),x2:px(m.mean),y1:20,y2:166,class:'mean-marker','data-estimate':m.mean}),svgEl('path',{d:'M'+(px(m.mode)-7)+',177 L'+px(m.mode)+',166 L'+(px(m.mode)+7)+',177 Z',class:'mode-marker','data-estimate':m.mode}));
 root.append(el('p',{class:'visual-title'},'Compare the estimates'),svg);
 const key=el('div',{class:'plot-key'});key.append(el('span',{class:'key-mode'},'▲ MAP: '+fmt(m.mode)),el('span',{class:'key-mean-marker'},'Mean: '+fmt(m.mean)));root.append(key,el('p',{},'The MAP is at the most probable value. The mean weights every possible value.'));
 return {update:s=>{root.hidden=!(s.checked.has(config.exactId||'guess')&&s.checked.has('squared'));},open:()=>{}};
}
function mixture(root,config){
 const parts=math.contributions(config.rows),eventSection=el('section'),meanSection=el('section');
 function bar(section,key,title,limit,unit){section.append(el('p',{class:'visual-title'},title));const total=parts.reduce((sum,p)=>sum+p[key],0),track=el('div',{class:'contribution-track','aria-hidden':'true'});
 parts.forEach((p,i)=>{const segment=el('span',{class:'contribution segment-'+i,style:'width:'+(100*p[key]/limit)+'%','data-group':p.name,'data-contribution':p[key]});segment.append(el('span',{class:'segment-label'},p.name));track.append(segment);});
 section.append(track);const scale=el('div',{class:'bar-scale'});scale.append(el('span',{},'0'),el('span',{},fmt(limit)+(unit?' '+unit:'')));section.append(scale);
 const list=el('ul',{class:'contribution-list'});parts.forEach((p,i)=>{const r=config.rows[i],within=key==='event'?r.prob:r.mean;list.append(el('li',{},'Group '+p.name+': '+fmt(r.weight)+' × '+fmt(within)+' = '+fmt(p[key])+(unit?' '+unit:'')));});section.append(list,el('p',{class:'contribution-total'},'Total: '+fmt(total)+(unit?' '+unit:'')));}
 bar(eventSection,'event','Contributions to P(E)',1,'');bar(meanSection,'mean','Contributions to the overall mean',Math.max(...config.rows.map(r=>r.mean)),'cm');root.append(eventSection,meanSection);
 return {update:s=>{eventSection.hidden=!s.checked.has('probability');meanSection.hidden=!s.checked.has('expectation');root.hidden=eventSection.hidden&&meanSection.hidden;},open:()=>{}};
}
function likelihood(root,config){
 const rss=mu=>config.values.reduce((sum,y)=>sum+(y-mu)**2,0),base=rss(config.means[0]);
 const relative=mu=>(base-rss(mu))/(2*config.sd*config.sd);
 const low=Math.min(...config.means)-1,high=Math.max(...config.means)+1;
 const peak=config.values.reduce((a,b)=>a+b,0)/config.values.length;
 const floor=Math.floor(Math.min(relative(low),relative(high))-0.5),ceiling=Math.ceil(relative(peak)+0.5);
 const px=x=>48+(x-low)/(high-low)*520,py=y=>166-(y-floor)/(ceiling-floor)*136;
 const svg=plot('Log-likelihood as the candidate mean varies for fixed observations. A and B mark the compared means.');
 root.append(el('p',{class:'visual-title'},'Keep the sample fixed'),svg);
 axis(svg,48,166,568,166);axis(svg,48,30,48,166);
 const ticks=[floor,Math.round((floor+ceiling)/2),0].filter((v,i,a)=>a.indexOf(v)===i);
 ticks.forEach(v=>svg.append(svgEl('text',{x:39,y:py(v)+5,'text-anchor':'end'},fmt(v))));
 for(let x=Math.ceil(low);x<=high;x++){axis(svg,px(x),166,px(x),171);svg.append(svgEl('text',{x:px(x),y:194,'text-anchor':'middle'},fmt(x)));}
 svg.append(svgEl('text',{x:48,y:22},'Relative log-likelihood'),svgEl('text',{x:568,y:232,'text-anchor':'end'},'Candidate mean μ (cm)'));
 const curve=Array.from({length:321},(_,i)=>{const mu=low+(high-low)*i/320;return (i?'L':'M')+px(mu).toFixed(3)+','+py(relative(mu)).toFixed(3);}).join(' ');
 svg.append(svgEl('path',{d:curve,class:'likelihood-curve','data-low':low,'data-high':high,'data-floor':floor,'data-ceiling':ceiling}));
 config.means.forEach((mu,i)=>{const attrs={'data-candidate':i?'B':'A','data-mean':mu,'data-rss':rss(mu),'data-relative':relative(mu)};
 if(i===0)svg.append(svgEl('circle',{cx:px(mu),cy:py(relative(mu)),r:6,class:'candidate-A',...attrs}));
 else svg.append(svgEl('path',{d:'M'+px(mu)+','+(py(relative(mu))-8)+' l8,8 l-8,8 l-8,-8 Z',class:'candidate-B',...attrs}));});
 const marker=svgEl('line',{x1:px(config.means[0]),x2:px(config.means[0]),y1:30,y2:166,class:'candidate-marker'});svg.append(marker);
 const controls=el('div',{class:'visual-candidates'}),readout=el('p',{class:'visual-readout',role:'status'}),buttons=[];
 config.means.forEach((mu,i)=>{const button=el('button',{type:'button',class:'text-button','data-inspect':i?'B':'A','aria-pressed':i?'false':'true'},(i?'◇ B':'● A')+': μ = '+fmt(mu)+' cm');buttons.push(button);button.addEventListener('click',()=>select(i));controls.append(button);});
 root.append(controls,readout,el('p',{},'Scores are differences from candidate A’s log-likelihood. They compare fit to these same observations.'));
 function select(i){const mu=config.means[i];marker.setAttribute('x1',px(mu));marker.setAttribute('x2',px(mu));buttons.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));readout.textContent='Candidate '+(i?'B':'A')+': squared deviations total '+fmt(rss(mu))+' cm²; relative log-likelihood '+fmt(relative(mu))+'.';}
 select(0);
 return {update:s=>{root.hidden=!(s.checked.has('squared')&&s.checked.has('fit'));},open:()=>{}};
}

function attention(root,config,support){
 const detail=el('details',{class:'visual-disclosure'}),size=config.size;
 detail.append(el('summary',{},'Inspect an attention mask'));
 detail.append(el('p',{},'Practice sequence: '+size+' positions. Select the position whose output is being computed.'));
 const controls=el('div',{class:'attention-queries','aria-label':'Query position'});
 const grid=el('table',{class:'attention-grid'}),head=el('thead'),heading=el('tr');
 grid.append(el('caption',{},'Causal attention mask. Rows are query positions; columns are source positions. ✓ permitted; × excluded.'));
 heading.append(el('th',{scope:'col'},'Query'));
 for(let j=1;j<=size;j++)heading.append(el('th',{scope:'col'},String(j)));
 head.append(heading);grid.append(head);const body=el('tbody');grid.append(body);
 for(let i=1;i<=size;i++){
  const row=el('tr',{'data-query':i});row.append(el('th',{scope:'row'},String(i)));
  for(let j=1;j<=size;j++)row.append(el('td',{'data-source':j,'data-permitted':String(j<=i),'aria-label':'Source '+j+': '+(j<=i?'permitted':'excluded')},j<=i?'✓':'×'));
  body.append(row);
 }
 const out=el('p',{class:'attention-readout',role:'status'});
 function select(query){
  controls.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.query)===query)));
  body.querySelectorAll('tr').forEach(row=>row.classList.toggle('selected-query',Number(row.dataset.query)===query));
  out.textContent='Query position '+query+' can use source '+(query===1?'position 1':'positions '+Array.from({length:query},(_,i)=>i+1).join(', '))+'. The current position is included.';
  root.dataset.query=query;
 }
 for(let i=1;i<=size;i++){
  const button=el('button',{type:'button',class:'text-button','data-query':i,'aria-pressed':'false'},'Position '+i);
  button.addEventListener('click',()=>{support();select(i);});controls.append(button);
 }
 detail.append(controls,grid,out);root.append(detail);select(2);
 detail.addEventListener('toggle',()=>{if(detail.open)support();});
 return {update:s=>{root.hidden=!s.checked.has(config.revealAfter);},open:()=>{detail.open=true;}};
}

function slotsOpening(mount,config){
 const [a,b]=config.p,n=config.trials,gcd=(x,y)=>y?gcd(y,x%y):x;
 const row=el('div',{class:'slot-toggles',role:'group','aria-label':'Trial results'}),boxes=[];
 for(let i=1;i<=n;i++){
  const label=el('label',{class:'slot-toggle'}),box=el('input',{type:'checkbox',value:String(i),'aria-describedby':'slots-readout'}),glyph=el('span',{class:'slot-glyph','aria-hidden':'true'},'○');
  label.append(box,el('span',{},'Trial '+i),glyph);row.append(label);boxes.push([box,glyph]);
 }
 const out=el('p',{id:'slots-readout',class:'slots-readout',role:'status'});
 function draw(){
  const marked=boxes.flatMap(([box],i)=>box.checked?[i+1]:[]),k=marked.length;
  boxes.forEach(([box,glyph])=>{glyph.textContent=box.checked?'●':'○';});
  const num=a**k*(b-a)**(n-k),den=b**n,g=gcd(num,den);
  const factors=boxes.map(([box])=>box.checked?a+'/'+b:(b-a)+'/'+b).join(' × ');
  const where=k===0?'No successes':k===1?'Success in trial '+marked[0]:'Successes in trials '+marked.slice(0,-1).join(', ')+' and '+marked[k-1];
  out.textContent=where+'. This sequence has probability '+factors+' = '+(num/g)+'/'+(den/g)+'.';
  mount.dataset.successes=k;mount.dataset.sequence=(num/g)+'/'+(den/g);
 }
 row.addEventListener('input',draw);mount.append(row,out);draw();
}

function binomial(root,config){
 const {trials,successes}=config,sets=[];
 (function extend(start,chosen){if(chosen.length===successes){sets.push(chosen);return;}for(let i=start;i<=trials;i++)extend(i+1,[...chosen,i]);})(1,[]);
 const detail=el('details',{class:'visual-disclosure'});
 detail.append(el('summary',{},'See the '+sets.length+' sequences'));
 detail.append(el('p',{},'Each row is one choice of '+successes+' success positions among '+trials+' trials. ● success, ○ failure.'));
 const list=el('ol',{class:'sequence-list'});
 for(const set of sets){
  const row=el('li',{class:'sequence-row','data-positions':set.join(',')});
  const slots=el('span',{class:'slots','aria-hidden':'true'});
  for(let i=1;i<=trials;i++)slots.append(el('span',{class:set.includes(i)?'slot success':'slot'},set.includes(i)?'●':'○'));
  const label=set.length>1?set.slice(0,-1).join(', ')+' and '+set[set.length-1]:String(set[0]);
  row.append(el('span',{class:'row-label'},'Positions '+label),slots,el('span',{class:'row-probability',hidden:''},config.sequenceProbability));
  list.append(row);
 }
 const total=el('p',{class:'sequence-total',hidden:''},sets.length+' sequences × '+config.sequenceProbability+' = '+config.total);
 detail.append(list,total);root.append(detail);
 return {update:s=>{root.hidden=!s.checked.has(config.revealAfter);const shown=s.checked.has(config.probabilitiesAfter);list.querySelectorAll('.row-probability').forEach(e=>{e.hidden=!shown;});total.hidden=!shown;},open:()=>{detail.open=true;}};
}

function create({config,mount,table,support}){
 const root=el('aside',{class:'method-visual',hidden:'','aria-label':'Mathematical illustration','data-visual':config.kind});mount.append(root);
 let view;if(config.kind==='spread')view=spread(root,support,config);else if(config.kind==='conditioning')view=conditioning(root,config,support,table);else if(config.kind==='variance')view=variance(root);else if(config.kind==='posterior')view=posterior(root,config);else if(config.kind==='mixture')view=mixture(root,config);else if(config.kind==='likelihood')view=likelihood(root,config);else if(config.kind==='attention')view=attention(root,config,support);else if(config.kind==='binomial')view=binomial(root,config);else throw Error('Unknown visual kind');
 return {root,update:view.update,open:view.open};
}
function opening(mount,config){
 if(config.intro)mount.append(el('p',{},config.intro));
 if(config.kind==='spread'){
  const view=create({config:{...config,kind:'spread'},mount,support:()=>{}});view.update({checked:new Set(['means'])});const detail=view.root.querySelector('details');for(const child of [...detail.children])if(child.tagName!=='SUMMARY')view.root.append(child);detail.remove();return;
 }
 if(config.kind==='candidate'){
  const svg=svgEl('svg',{viewBox:'0 0 600 180',role:'img','aria-label':'Fixed observations and a movable candidate mean.'});
  const px=x=>40+(x-config.min)/(config.max-config.min)*520;axis(svg,40,100,560,100);
  config.values.forEach(v=>{svg.append(svgEl('circle',{cx:px(v),cy:100,r:7,class:'observed-point','data-observed':v}),svgEl('text',{x:px(v),y:130,'text-anchor':'middle'},String(v)));});
  const residuals=config.values.map((v,i)=>{const line=svgEl('line',{y1:40+20*i,y2:40+20*i,x2:px(v),class:'deviation-segment','data-observation':v});svg.append(line);return line;});
  const marker=svgEl('line',{y1:20,y2:110,class:'mean-marker'});svg.append(marker);mount.append(svg);
  const label=el('label',{class:'visual-slider'},'Candidate mean (cm)'),slider=el('input',{type:'range',min:config.min,max:config.max,step:'.5',value:config.initial});label.append(slider);const out=el('p',{role:'status',class:'candidate-readout'});
  function draw(){const mu=Number(slider.value);marker.setAttribute('x1',px(mu));marker.setAttribute('x2',px(mu));residuals.forEach(line=>line.setAttribute('x1',px(mu)));slider.setAttribute('aria-valuetext',mu+' cm');out.textContent='Candidate mean: '+mu+' cm. Observations: '+config.values.join(', ')+' cm. Signed deviations: '+config.values.map(v=>fmt(v-mu)).join(', ')+' cm.';}
  slider.addEventListener('input',draw);mount.append(label,out);draw();return;
 }
 if(config.kind==='slots'){slotsOpening(mount,config);return}
 throw Error('Unknown opening kind');
}
function estimates(mount,q){
 const svg=plot('Posterior probabilities and candidate estimates A, B and C.');
 const px=x=>48+(x+1)/10*520;axis(svg,48,166,568,166);
 q.support.forEach((v,i)=>{svg.append(svgEl('line',{x1:px(v),x2:px(v),y1:166,y2:166-q.posterior[i]*200,class:'posterior-stick'}),svgEl('text',{x:px(v),y:190,'text-anchor':'middle'},String(v)));});
 q.estimates.forEach((v,i)=>{svg.append(svgEl('line',{x1:px(v),x2:px(v),y1:28+i*8,y2:160,class:'estimate-marker marker-'+i,'data-estimate':String(v)}),svgEl('text',{x:px(v),y:25+i*16,'text-anchor':'middle'},String.fromCharCode(65+i)));});
 const values=el('p',{class:'posterior-values'},q.support.map((v,i)=>'P(θ = '+v+') = '+q.posterior[i]).join('; '));mount.append(values,svg);
}
window.reviewVisuals={create,math,opening,estimates};
})();
