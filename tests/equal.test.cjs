// Run with: node --test tests/equal.test.cjs
// Dependency-free interaction/state tests. These do not emulate browser rendering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(process.env.EQUAL_TEST_SOURCE || path.join(__dirname,'../equal.html'),'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup() {
 const elements = new Map(), listeners = new Map();
 const groups = {
  home:['splitMode','centerMode','play','homeSound','help'],
  game:['canvas','pause','next'],
  summary:['again','summaryHome'],
  pauseModal:['pauseSound','haptics','resume','pauseHome','fullscreen'],
  helpModal:['closeHelp']
 };
 const gradient = {addColorStop(){}};
 const context2d = new Proxy({}, {get:(o,k)=>o[k] || (k.startsWith('create') ? ()=>gradient : ()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 const listen=(id,k,fn)=>{const key=id+':'+k;if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(fn);};
 let clock=1000;
 function element(id){
  if(!elements.has(id))elements.set(id,{
   id, hidden:['game','summary','pauseModal','helpModal','balance'].includes(id),inert:false,disabled:false,
   textContent:'',innerHTML:'',attributes:{},classes:new Set(),captures:new Set(),
   classList:{add(...v){v.forEach(x=>element(id).classes.add(x));},remove(...v){v.forEach(x=>element(id).classes.delete(x));}},
   setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(k,fn){listen(id,k,fn);},
   getContext:()=>context2d,
   bounds:{left:20,top:110,width:390,height:520,right:410,bottom:630},
   getBoundingClientRect(){return this.bounds;},
   focus(){runtime.document.activeElement=this;},
   setPointerCapture(i){this.captures.add(i);},hasPointerCapture(i){return this.captures.has(i);},releasePointerCapture(i){this.captures.delete(i);},
   querySelector(){return element((groups[id]||['button'])[0]);},querySelectorAll(){return (groups[id]||['button']).map(element);},
   closest(){const parent=Object.keys(groups).find(g=>groups[g].includes(id));return this.hidden||this.inert?this:parent&&(element(parent).hidden||element(parent).inert)?element(parent):null;}
  });
  return elements.get(id);
 }
 const runtime={console,Math,JSON,Number,Array,Promise,
  document:{hidden:false,documentElement:{},getElementById:element,querySelector:element,addEventListener:(k,fn)=>listen('document',k,fn)},
  window:{PointerEvent:class{},addEventListener:(k,fn)=>listen('window',k,fn)},
  matchMedia:()=>({matches:true}),localStorage:{getItem:()=>null,setItem(){}},
  performance:{now:()=>clock},requestAnimationFrame:()=>0,cancelAnimationFrame(){},devicePixelRatio:3,
  navigator:{vibrate(){}},ResizeObserver:class{observe(){}},setTimeout:()=>0,clearTimeout(){}
 };
 vm.createContext(runtime);vm.runInContext(script,runtime);
 const run=s=>vm.runInContext(s,runtime);
 function event(id,type,props={}){const e={pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:100,clientY:200,detail:1,preventDefault(){},...props};for(const fn of listeners.get(id+':'+type)||[])fn(e);const handler=element(id)['on'+type];if(handler)handler(e);return e;}
 function tap(id){event(id,'pointerdown');event(id,'pointerup');}
 function click(id){event(id,'click');}
 function keyboard(id){event(id,'click',{detail:0,pointerType:''});}
 function square(){run('poly=[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}];centroid=center(poly)');}
 return {run,event,tap,click,keyboard,element,square,runtime,tick:ms=>clock+=ms};
}
test('first touch activates once before compatibility click',()=>{
 const h=setup();h.tap('centerMode');assert.equal(h.run('mode'),'center');
 h.event('homeSound','pointerdown');h.event('window','blur');h.event('homeSound','pointerup');assert.equal(h.run('sound'),true);h.click('homeSound');assert.equal(h.run('sound'),true);
 h.tap('homeSound');assert.equal(h.run('sound'),false);
 h.tap('play');assert.equal(h.run('view'),'game');assert.equal(h.element('pauseModal').hidden,true);
 h.click('play');assert.equal(h.run('round'),1);
 h.tap('pause');assert.equal(h.element('pauseModal').hidden,false);
 h.tap('resume');assert.equal(h.element('pauseModal').hidden,true);
});
test('native keyboard/assistive clicks and mouse pointer releases work',()=>{
 const h=setup();h.keyboard('centerMode');assert.equal(h.run('mode'),'center');
 h.event('homeSound','pointerdown',{pointerType:'mouse'});h.event('homeSound','pointerup',{pointerType:'mouse'});assert.equal(h.run('sound'),true);
 h.event('homeSound','click',{pointerType:'mouse'});assert.equal(h.run('sound'),true);
 h.keyboard('homeSound');assert.equal(h.run('sound'),false);
});
test('dragging, release outside, cancellation and second pointers do not activate buttons',()=>{
 const h=setup();h.event('homeSound','pointerdown');h.event('homeSound','pointermove',{clientX:150});h.event('homeSound','pointerup');assert.equal(h.run('sound'),false);
 h.event('homeSound','pointerdown');h.event('homeSound','pointerup',{clientX:500});assert.equal(h.run('sound'),false);
 h.event('homeSound','pointerdown');h.event('homeSound','pointercancel');h.event('homeSound','pointerup');assert.equal(h.run('sound'),false);
 h.event('homeSound','pointerdown',{isPrimary:false,pointerId:2});h.event('homeSound','pointerup',{pointerId:2});assert.equal(h.run('sound'),false);
 h.event('homeSound','pointerdown');h.event('homeSound','lostpointercapture');h.event('homeSound','pointerup');assert.equal(h.run('sound'),false);
});
test('hidden, inert and disabled buttons cannot activate',()=>{
 const h=setup();h.tap('again');assert.equal(h.run('view'),'home');
 h.element('homeSound').disabled=true;h.tap('homeSound');assert.equal(h.run('sound'),false);
 h.tap('help');h.tap('play');assert.equal(h.run('view'),'home');h.tap('closeHelp');assert.equal(h.element('helpModal').hidden,true);
});
test('focus changes never open pause; true backgrounding does',()=>{
 const h=setup();h.keyboard('play');h.event('window','blur');assert.equal(h.element('pauseModal').hidden,true);
 h.runtime.document.hidden=true;h.event('document','visibilitychange');assert.equal(h.element('pauseModal').hidden,false);
 h.runtime.document.hidden=false;h.event('document','visibilitychange');h.tap('resume');assert.equal(h.element('pauseModal').hidden,true);
});
test('Play does not request fullscreen or require a second resume tap',()=>{
 const h=setup();let requests=0;h.runtime.document.documentElement.requestFullscreen=()=>{requests++;h.event('window','blur');return Promise.resolve();};
 h.tap('play');assert.equal(requests,0);assert.equal(h.element('pauseModal').hidden,true);
});
test('CENTER preview is exactly 64 CSS pixels above touch and lift drift is ignored',()=>{
 const h=setup();h.keyboard('centerMode');h.keyboard('play');h.square();
 const at=h.run('screen(centroid)'),p={clientX:at.x+20,clientY:at.y+110+64};
 h.event('canvas','pointerdown',p);assert(Math.abs(h.run('screen(drag.b).y')-(p.clientY-110-64))<1e-9);
 const target=h.run('JSON.stringify(drag.b)');h.event('canvas','pointerup',{clientX:p.clientX+12,clientY:p.clientY+15});
 assert.equal(h.run('JSON.stringify(guess)'),target);assert.equal(h.run('scores[0]'),100);
});
test('unchanged resize notifications preserve aiming; actual resize cancels safely',()=>{
 const h=setup();h.keyboard('centerMode');h.keyboard('play');h.event('canvas','pointerdown');h.run('resize()');assert.equal(h.run('pointer'),1);
 h.element('arena').bounds.width=360;h.run('resize()');assert.equal(h.run('pointer'),null);assert.equal(h.run('scores.length'),0);
});
test('result tap advances once and delayed pointer clicks never skip a round',()=>{
 const h=setup();h.keyboard('play');h.square();h.run('submit({x:0,y:-2},{x:0,y:2})');assert.equal(h.run('scores[0]'),100);
 assert.equal(h.element('balance').hidden,false);assert(h.element('balance').innerHTML.includes('50%'));
 h.tap('next');h.click('next');assert.equal(h.run('round'),2);assert.equal(h.run('scores.length'),1);
 h.square();h.run('submit({x:0,y:-2},{x:0,y:2})');h.event('canvas','pointerdown');h.event('canvas','pointerup');assert.equal(h.run('round'),3);
});
test('a drag or cancelled pointer on a result never advances',()=>{
 const h=setup();h.keyboard('play');h.square();h.run('submit({x:0,y:-2},{x:0,y:2})');
 h.event('canvas','pointerdown');h.event('canvas','pointermove',{clientX:140});h.event('canvas','pointerup');assert.equal(h.run('round'),1);
 h.event('canvas','pointerdown');h.event('canvas','pointercancel');h.event('canvas','pointerup');assert.equal(h.run('round'),1);
});
test('ten rounds, score, replay and menu resume retain correct state',()=>{
 const h=setup();h.keyboard('play');
 for(let i=0;i<10;i++){h.square();h.run('submit({x:0,y:-2},{x:0,y:2})');h.tap('next');h.click('next');}
 assert.equal(h.run('view'),'summary');assert.equal(h.element('totalPoints').textContent,1000);assert.equal(h.element('finalScore').textContent,'%100,0');
 h.tap('again');assert.equal(h.run('scores.length'),0);assert.equal(h.run('round'),1);
 h.square();h.run('submit({x:0,y:-2},{x:0,y:2})');h.tap('pause');h.tap('pauseHome');h.tap('centerMode');h.tap('play');assert.equal(h.run('scores.length'),0);
 h.tap('pause');h.tap('pauseHome');h.tap('splitMode');h.tap('play');assert.equal(h.run('scores.length'),1);assert.equal(h.run('phase'),'result');assert.equal(h.element('balance').hidden,false);
});
test('tap cancellation and misses never consume a scoring attempt',()=>{
 const h=setup();h.keyboard('play');h.square();h.run('submit({x:0,y:0},{x:0,y:0});submit({x:0,y:-3},{x:1,y:-3})');assert.equal(h.run('scores.length'),0);
 h.event('canvas','pointerdown');h.event('canvas','pointercancel');h.event('canvas','pointerup');assert.equal(h.run('scores.length'),0);
});

test('Enter on CENTER result advances without submitting the next shape',()=>{
 const h=setup();h.keyboard('centerMode');h.keyboard('play');h.square();h.run('submit(centroid,centroid)');
 h.event('canvas','keydown',{key:'Enter'});assert.equal(h.run('round'),2);assert.equal(h.run('scores.length'),1);assert.equal(h.run('phase'),'ready');
});
