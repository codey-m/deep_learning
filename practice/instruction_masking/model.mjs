// Displayed cases. Must equal runner.py CASES (checked by tests/test_runner.py).
export const CASES = [{"id": "notebook", "name": "Two-turn conversation", "roles": ["system", "system", "user", "user", "user", "assistant", "assistant", "user", "user", "assistant", "assistant"], "losses": [0.9, 0.7, 1.7, 1.4, 1.5, 0.9, 0.7, 1.6, 1.3, 0.8, 0.6]}, {"id": "one-token-replies", "name": "One-token replies", "roles": ["system", "user", "assistant", "user", "assistant", "user", "assistant"], "losses": [1.1, 1.8, 0.5, 1.6, 0.4, 1.9, 0.7]}, {"id": "ends-with-user", "name": "Ends on the user’s turn", "roles": ["system", "system", "user", "assistant", "assistant", "user", "user", "user"], "losses": [0.8, 0.6, 1.5, 0.9, 0.5, 1.7, 1.2, 1.4]}, {"id": "assistant-first", "name": "Assistant speaks first", "roles": ["assistant", "assistant", "user", "user", "assistant", "assistant", "assistant"], "losses": [0.6, 0.5, 1.6, 1.3, 0.8, 0.7, 0.4]}];
export const ROLE = {system:{letter:'S',name:'system'},user:{letter:'U',name:'user'},assistant:{letter:'A',name:'assistant'}};
export const STARTER = `def target_mask(roles, supervised_role="assistant"):
    \"\"\"Return the 0/1 mask over TARGETS for a next-token objective.\"\"\"
    # Return a list of 0/1 over the targets, with 1 where the target is supervised.
    raise NotImplementedError("Build the target mask.")


def supervised_mean_nll(losses, mask):
    \"\"\"Mean NLL over supervised targets only, excluding the rest from sum and count.\"\"\"
    # Average the losses of the targets the mask selects.
    raise NotImplementedError("Average over the supervised targets.")
`;
export function copyCase(c){return JSON.parse(JSON.stringify(c));}
export function format(v){if(v===null||v===undefined)return '—';const n=Number(v);return Math.abs(n)>=10000?n.toExponential(3):n.toLocaleString('en-US',{maximumSignificantDigits:4});}
// Shared editor convention (identical to bootstrap/dist/model.mjs): Tab inserts four spaces or indents selected lines.
export function indentSelection(text,start,end){
 const lineStart=text.lastIndexOf('\n',start-1)+1;
 if(start===end)return {text:text.slice(0,start)+'    '+text.slice(end),start:start+4,end:start+4};
 const block=text.slice(lineStart,end),replacement=block.split('\n').map(line=>'    '+line).join('\n');
 return {text:text.slice(0,lineStart)+replacement+text.slice(end),start:start+4,end:end+replacement.length-block.length};
}
