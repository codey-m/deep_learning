export const CASES = [
  {id:'five-nodes',name:'Five connected nodes',features:[1,2,3,4,5],edges:[[0,1],[0,2],[1,2],[2,3],[3,4]]},
  {id:'unequal-degrees',name:'One busy node',features:[2,-1,5,3,7],edges:[[0,1],[0,2],[0,3],[0,4],[1,2]]},
  {id:'isolated-node',name:'A node on its own',features:[3,8,-2,6,11],edges:[[0,1],[1,2],[2,3]]},
  {id:'changed-features',name:'Same links, new values',features:[8,0,-3,2,6],edges:[[0,1],[0,2],[1,2],[2,3],[3,4]]},
];
export const STAGES = {
 sum:{title:'Add the neighbors’ features.',description:'Return one new value per node. Read every value from the original graph, so all five nodes update together. A node with no neighbors returns 0.',hint:'Each new feature combines the values at the other ends of this node’s links. The node’s own feature is not part of that collection.',doc:'Return each node’s neighbor sum.',transfer:'Change a feature or add the A—E link. Compare which nodes change and which stay the same.'},
 mean:{title:'Average the neighbors’ features.',description:'Return the mean of each node’s neighbors. Read the original features without changing the inputs. For this exercise, a node with no neighbors returns 0.',hint:'Two nodes can receive the same total from different numbers of neighbors. What should their averages do?',doc:'Return each node’s neighbor mean; use 0 for no neighbors.',transfer:'Compare a node with one neighbor and a node with three. When do sum and mean agree, and when do they differ?'},
 self:{title:'Keep the node’s own feature, too.',description:'Return the sum of each node’s neighbors plus its own original feature. All nodes update together. An isolated node keeps its original value.',hint:'A neighbor-only rule loses a node’s own feature. This version includes it once, alongside the values from its neighbors.',doc:'Return each node’s neighbor sum plus its own feature.',transfer:'Inspect the isolated-node graph. What information survives here that disappeared under neighbor-only aggregation?'}
};
export function starter(stage) {
 return `def message_pass(features, neighbors):\n    """${STAGES[stage].doc}"""\n    new_features = []\n    for node in range(len(features)):\n        # Your update rule goes here.\n        raise NotImplementedError("Complete the update rule.")\n    return new_features\n`;
}
export function neighborsFor(graph) {
 const neighbors=Object.fromEntries(graph.features.map((_,i)=>[i,[]]));
 for(const [a,b] of graph.edges){neighbors[a].push(b);neighbors[b].push(a);}
 return neighbors;
}
export function copyCase(graph){return JSON.parse(JSON.stringify(graph));}
export function format(value){
 if(value===null||value===undefined)return '—';
 const n=Number(value),m=Math.abs(n);
 return m>=10000||(m>0&&m<0.001)?n.toExponential(3):n.toLocaleString('en-US',{maximumSignificantDigits:6});
}
// Shared editor convention (identical to bootstrap/dist/model.mjs): Tab inserts four spaces or indents selected lines.
export function indentSelection(text,start,end){
 const lineStart=text.lastIndexOf('\n',start-1)+1;
 if(start===end)return {text:text.slice(0,start)+'    '+text.slice(end),start:start+4,end:start+4};
 const block=text.slice(lineStart,end),replacement=block.split('\n').map(line=>'    '+line).join('\n');
 return {text:text.slice(0,lineStart)+replacement+text.slice(end),start:start+4,end:end+replacement.length-block.length};
}
// One vocabulary for the page and its diagnosis. Each named rule gives the five values it produces on the
// displayed graph. "In place" variants overwrite as they go, so later nodes read neighbors already replaced:
// the sequential-update bug this activity is about. Classification describes returned values, not a trace.
const aggregate={sum:(vals)=>vals.reduce((a,b)=>a+b,0),mean:(vals)=>vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0,self:(vals,own)=>vals.reduce((a,b)=>a+b,own)};
export function applyRule(graph,kind,inPlace=false){
 const nb=neighborsFor(graph),h=graph.features.slice();
 return graph.features.map((_,i)=>{const src=inPlace?h:graph.features,v=aggregate[kind](nb[i].map(j=>src[j]),src[i]);if(inPlace)h[i]=v;return v;});
}
const RULE_NAMES={sum:'the neighbor sum',mean:'the neighbor mean',self:'the neighbor sum plus the node’s own feature'};
export const RULES=[
 ...['sum','mean','self'].map(kind=>({key:kind,kind,inPlace:false,describe:RULE_NAMES[kind]})),
 ...['sum','mean','self'].map(kind=>({key:`${kind}-in-place`,kind,inPlace:true,describe:`${RULE_NAMES[kind]}, computed in place: nodes update one at a time, so later nodes read neighbors that were already replaced`})),
 {key:'identity',describe:'the original features, unchanged'},
];
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>Math.abs(x-b[i])<=1e-9*(1+Math.abs(b[i])));
export const ruleValues=(graph,rule)=>rule.key==='identity'?graph.features.slice():applyRule(graph,rule.kind,rule.inPlace);
// First named rule matching every returned value, excluding the stage's own rule; synchronous rules are tried first.
export function classify(graph,stage,values){return RULES.find(r=>r.key!==stage&&same(values,ruleValues(graph,r)))||null;}
// For an in-place match, the values node i actually combined: neighbors earlier in node order had already changed.
export function inPlaceTerms(graph,kind,i){
 const nb=neighborsFor(graph),h=graph.features.slice();
 for(let k=0;k<i;k++)h[k]=aggregate[kind](nb[k].map(j=>h[j]),h[k]);
 return {neighbors:nb[i].map(j=>({j,value:h[j],changed:j<i&&h[j]!==graph.features[j]})),own:h[i]};
}
const mi=(base,sub)=>`<msub><mi>${base}</mi>${sub}</msub>`,iSub='<mi>i</mi>',jSub='<mi>j</mi>';
const hPrime=`<msubsup><mi>h</mi><mi>i</mi><mo>′</mo></msubsup>`,sumN=`<munder><mo largeop="true" movablelimits="false">∑</mo><mrow><mi>j</mi><mo>∈</mo><mi>N</mi><mo>(</mo><mi>i</mi><mo>)</mo></mrow></munder>`;
const math=(body,label)=>`<math display="block" displaystyle="true" aria-label="${label}"><mrow>${body}</mrow></math>`;
STAGES.sum.math=math(`${hPrime}<mo>=</mo>${sumN}${mi('h',jSub)}`,'h i prime equals the sum over neighbors j of i of h j');
STAGES.mean.math=math(`${hPrime}<mo>=</mo><mfrac><mn>1</mn><mrow><mo>|</mo><mi>N</mi><mo>(</mo><mi>i</mi><mo>)</mo><mo>|</mo></mrow></mfrac>${sumN}${mi('h',jSub)}`,'h i prime equals one over the number of neighbors of i, times the sum over neighbors j of i of h j');
STAGES.self.math=math(`${hPrime}<mo>=</mo>${mi('h',iSub)}<mo>+</mo>${sumN}${mi('h',jSub)}`,'h i prime equals h i plus the sum over neighbors j of i of h j');
