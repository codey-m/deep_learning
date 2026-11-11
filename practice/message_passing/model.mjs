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
