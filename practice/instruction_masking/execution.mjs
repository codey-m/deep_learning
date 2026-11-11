// Reusable browser execution lifecycle. No DOM access and no learner code transmission.
export class PythonExecutor {
 constructor({onStatus=()=>{},onMetrics=()=>{},role='student',workerFactory=null,loadTimeout=45000,runTimeout=5000}={}) {
  Object.assign(this,{onStatus,onMetrics,role,loadTimeout,runTimeout});
  this.workerFactory=workerFactory||(()=>{const url=new URL('./worker.js',import.meta.url);url.searchParams.set('role',role);return new Worker(url,{type:'module'});});
  this.workerStarts=0;
  this.worker=null;this.pending=null;this.ready=false;this.generation=0;this.sequence=0;
 }
 status(state,message){this.onStatus({state,message});}
 load(){
  if(this.ready)return Promise.resolve();
  if(this.loading)return this.loading;
  const generation=++this.generation;this.status('loading','Loading Python for your browser…');
  this.loading=new Promise((resolve,reject)=>{this.loadResolve=resolve;this.loadReject=reject;});
  const promise=this.loading;
  try{
   this.worker=this.workerFactory();this.workerStarts++;
   this.loadTimer=setTimeout(()=>this.fail('Python did not finish loading. Check your connection, then retry.'),this.loadTimeout);
   this.worker.onmessage=({data})=>{
    if(generation!==this.generation)return;
    if(data.type==='ready'){
     clearTimeout(this.loadTimer);this.ready=true;this.loading=null;
     this.loadResolve?.();this.loadResolve=null;this.loadReject=null;
     this.status('ready','Python ready · runs on your device');return;
    }
    if(data.type==='load-error'){this.fail(`Python could not load. ${data.error}`);return;}
    if(!this.pending||data.id!==this.pending.id)return;
    const pending=this.pending;this.pending=null;clearTimeout(this.runTimer);
    if(data.type==='result'){
     const finished=performance.now();
     this.onMetrics({role:this.role,warm:pending.warm,loadMs:pending.loadMs,executionMs:data.executionMs,roundTripMs:finished-pending.executeStarted,totalMs:finished-pending.started,workerStarts:this.workerStarts});
     this.status('ready','Python ready · runs on your device');pending.resolve(data.result);
    }
    else if(data.type==='error'){this.status('ready','Python ready · runs on your device');pending.reject(new Error(data.error));}
   };
   this.worker.onerror=()=>{if(generation===this.generation)this.fail('The Python worker stopped unexpectedly. Retry to start a fresh session.');};
  }catch(error){this.fail(String(error.message||error));}
  return promise;
 }
 get isLoading(){return Boolean(this.loading)&&!this.pending;}
 // isCurrent lets a caller abandon a run that was superseded while Python loaded, without discarding the runtime.
 async run(request,{isCurrent=()=>true}={}){
  if(this.role==='reference'&&request.mode!=='reference')throw new Error('The reference worker only accepts reference runs.');
  if(this.pending)throw new Error('A run is already in progress.');
  const started=performance.now(),warm=this.ready;
  await this.load();
  const executeStarted=performance.now(),loadMs=executeStarted-started;
  // Cancelled loads reject; this covers an externally replaced ready worker.
  if(!this.ready)throw new Error('The session was stopped.');
  if(!isCurrent()){const error=new Error('Superseded before execution.');error.superseded=true;throw error;}
  const id=++this.sequence;
  this.status('running',request.mode==='reference'?'Running reference…':'Running your function…');
  return new Promise((resolve,reject)=>{
   this.pending={id,resolve,reject,started,warm,executeStarted,loadMs};
   this.runTimer=setTimeout(()=>this.fail('Execution stopped after 5 seconds. Your code is preserved; run again to start a fresh Python session.'),this.runTimeout);
   this.worker.postMessage({type:'run',id,request});
  });
 }
 dispose(message){
  ++this.generation;clearTimeout(this.loadTimer);clearTimeout(this.runTimer);
  this.worker?.terminate();this.worker=null;this.ready=false;
  this.loadReject?.(new Error(message));this.loadReject=null;this.loadResolve=null;this.loading=null;
  this.pending?.reject(new Error(message));this.pending=null;
 }
 fail(message){this.dispose(message);this.status('error',message);}
 cancel(){this.dispose('Stopped. Your code is preserved.');this.status('idle','Stopped · the next run starts a fresh Python session');}
}
