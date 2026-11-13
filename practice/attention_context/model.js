/* Authored cases; all support stays within this optional review. */
(() => {
'use strict';
const r=(id,prompt,options,answer,retry,short,reason)=>({id,type:'radio',prompt,options,answer,retry,short,correct:'Correct. '+reason});
const n=(id,prompt,answer,retry,short,reason)=>({id,type:'number',prompt,answer,retry,short,label:'Attention weight',correct:'Correct. '+reason});
window.reviewModel={
 title:'Attention context',
 intro:'Remove the sources this query should not see. Then repair the weights.',
 reminder:'In causal self-attention, a query can use earlier source positions and its own position. The permitted weights must sum to one.',freshOptional:true,helpLabel:'Show the method',reviewTitle:'Try this first',freshTitle:'Try a different attention row',
 diagnostic:{
  intro:'A six-position sequence uses causal self-attention. Repair the attention row for the query at position 3.',
  questions:[
   {id:'visibility',type:'sources',prompt:'Which sources should be excluded?',query:3,weights:[.20,.15,.25,.10,.20,.10],
    options:[['1','Source 1 · weight 0.20'],['2','Source 2 · weight 0.15'],['3','Source 3 · weight 0.25'],['4','Source 4 · weight 0.10'],['5','Source 5 · weight 0.20'],['6','Source 6 · weight 0.10']],answer:['4','5','6'],
    misconceptions:{'1':'Source 1 is earlier than this query and is permitted.','2':'Source 2 is earlier than this query and is permitted.','3':'The current position is permitted in causal self-attention.'},
    short:'Exclude future sources',correct:'Correct. Sources 4–6 are later than query position 3. Removing them leaves total weight 0.60.'},
   n('weight','The retained weights are 0.20, 0.15 and 0.25. Renormalize them to sum to one. What weight should source position 2 receive?',.25,'Zeroing excluded weights leaves a retained total below one. The retained row still needs to be normalized.','Repair the normalization','The retained total is 0.20 + 0.15 + 0.25 = 0.60, so position 2 receives 0.15/0.60 = 0.25.'),
   r('change','Using the repaired row, change only the value vector at source position 6. Keep every attention score and all other values fixed. What happens to this head’s output at position 3?',[
    ['changes','It changes because the new value is part of the sequence.'],
    ['same','It stays the same because that source has weight zero.'],
    ['unknown','It depends on the magnitude of the new value.']
   ],'same','The head combines value vectors using its attention weights. A source excluded by this attention mask has coefficient zero.','Change an excluded source','Source position 6 has weight zero in this row, so changing its value cannot affect this head’s output at position 3.')
  ]
 },
 fresh:{
  intro:'Another six-position sequence uses causal self-attention. For the query at position 5, a head reports weights (0.10, 0.20, 0.10, 0.30, 0.30, 0) on source positions 1–6, in order.',
  questions:[
   r('fresh-visibility','Which diagnosis fits this new attention row?',[
    ['self','It is invalid because the current position has positive attention weight.'],
    ['uneven','It is invalid because the permitted source weights have different magnitudes.'],
    ['empty','It is invalid because position 6 has zero weight.'],
    ['valid','It is valid because it respects visibility and normalization.']
   ],'valid','The row must satisfy both the attention mask and normalization. The current source position is permitted.','Check the new row','The weights sum to one, position 5 itself is permitted, and the only later position has weight zero.'),
   n('fresh-weight','A second head at query position 5 has exponentiated scores (1, 2, 4, 1, 2, 10) for sources 1–6. After causal masking and normalization, what weight does source position 3 receive?',.4,'The exponentiated scores are positive terms to normalize. Only terms retained by this query’s attention mask enter the denominator.','Normalize a second head','The permitted terms total 1 + 2 + 4 + 1 + 2 = 10. Source position 3 receives 4/10 = 0.40; source 6 is excluded.'),
   r('fresh-change','In this second head, increase one coordinate of the value at source position 1 by 5. Keep all scores and other values fixed. What happens to that coordinate of the output at position 5?',[
    ['same','It stays the same because only position 5 contributes.'],
    ['unknown','Its direction of change depends on the other values.'],
    ['changes','It increases because position 1 has positive weight.']
   ],'changes','The scores stay fixed, so the weights stay fixed. A change in a permitted value is multiplied by its positive attention weight.','Change a permitted source','Source position 1 has weight 1/10, so increasing its value coordinate by 5 increases the output coordinate by 0.5.')
  ]
 },
 hints:[
  'For query position t, a causal attention mask permits source positions 1 through t, including t itself.',
  'An attention row must respect the attention mask as well as sum to one. Zeroing excluded weights can leave less than one in total.',
  'Divide each retained weight by the retained total. The output then combines only the permitted source values.'
 ],
 explanation:[
  'At query position 3, source positions 1, 2, and 3 are permitted. Positions 4, 5, and 6 are excluded by the causal attention mask. The proposed row sums to one but assigns positive weight to all three excluded sources.',
  'The retained weights total 0.20 + 0.15 + 0.25 = 0.60. Dividing each by 0.60 gives (1/3, 1/4, 5/12, 0, 0, 0). These weights sum to one and respect visibility. Simply zeroing the last three entries would leave a total of 0.60.',
  'Dividing every retained weight by the same total preserves their relative proportions. It gives the same row as normalizing the exponentiated scores over permitted sources from the outset.',
  'With scores and other values fixed, a change to source value 6 contributes zero to the output at query position 3. This conclusion concerns this attention head at this position.'
 ],
 freshExplanation:[
  'At query position 5, positions 1–5 are permitted, including position 5 itself. The supplied row puts zero on position 6 and sums to one, so it satisfies the causal attention mask and normalization.',
  'For the second head, the permitted exponentiated scores total 1 + 2 + 4 + 1 + 2 = 10. The full normalized row is (0.10, 0.20, 0.40, 0.10, 0.20, 0). Including the excluded term 10 in the denominator would incorrectly halve every permitted weight.',
  'The attention weight on source position 1 is 0.10. With scores fixed, an increase of 5 in that source’s value coordinate increases the output coordinate by 0.10 × 5 = 0.5.'
 ],
 visual:{kind:'attention',size:5,revealAfter:'visibility'},glossary:[]
};
})();

/* Worked content is owned by individual questions, not an all-parts solution. */
(()=>{const M=window.reviewModel,worked={"visibility": "At query position 3, causal self-attention permits source positions 1, 2 and 3, including the current position. Exclude sources 4, 5 and 6. The retained weights total 0.20 + 0.15 + 0.25 = 0.60.", "weight": "Divide every retained weight by 0.60. Source 2 receives 0.15/0.60 = 0.25. The repaired row is (1/3, 1/4, 5/12, 0, 0, 0), which sums to one.", "change": "The repaired row assigns source 6 weight zero. With scores and other values fixed, changing that source value contributes zero to this head’s output at position 3.", "fresh-visibility": "At query position 5, source positions 1–5 are permitted, including position 5 itself. The given weights sum to one and put zero on the only later source, position 6. The row is valid.", "fresh-weight": "Retain the first five exponentiated scores. Their sum is 1 + 2 + 4 + 1 + 2 = 10. Source 3 receives 4/10 = 0.40; the excluded score 10 at source 6 is not included in the denominator.", "fresh-change": "Source 1 has normalized weight 1/10. With scores fixed, increasing one coordinate of its value by 5 increases that output coordinate by (1/10) × 5 = 0.5."};for(const part of [M.diagnostic,M.fresh])for(const q of part.questions){q.worked=worked[q.id]||q.correct.replace(/^Correct\.\s*/, "");if(!q.worked)throw Error("Missing worked explanation: "+q.id);}})();
