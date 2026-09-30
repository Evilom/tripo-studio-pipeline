const {test}=require('node:test');const assert=require('node:assert/strict');
global.TripoWorkflowPolicy=require('../policy.js');global.getComputedStyle=()=>({visibility:'visible',display:'block'});global.innerWidth=1440;
const D=require('../dom-adapter.js');
// Minimal modeled DOM: deterministic discovery contracts, not a browser engine or live Tripo.
class Element {
  constructor(tag,text='',attrs={},children=[]){Object.assign(this,{tag,textContent:text,attrs,children,isConnected:true,disabled:false,accept:attrs.accept||'',clicks:0});for(const child of children)child.parentElement=this;}
  get innerText(){return this.textContent||this.children.map(c=>c.innerText).join(' ');}
  getClientRects(){return [this.getBoundingClientRect()];}
  getBoundingClientRect(){return {top:this.attrs.top??30,left:this.attrs.left??100};}
  getAttribute(name){return this.attrs[name]??null;}
  contains(other){return this.children.some(c=>c===other||c.contains(other));}
  matches(selector){return selector.split(',').some(s=>s==='[role="button"]'?this.attrs.role==='button':s==='[role="banner"]'?this.attrs.role==='banner':s==='input[type="file"]'?this.tag==='input'&&this.attrs.type==='file':s==='[class~="i-tripo:multi-view"]'?String(this.attrs.class||'').split(' ').includes('i-tripo:multi-view'):this.tag===s);}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  click(){this.clicks++;}
}
const el=(...args)=>new Element(...args);
function page(){const balance=el('span','1005');const generate=el('button','',{},[el('span','Generate'),el('span','65')]);const multi=el('button','',{},[el('span','',{class:'i-tripo:multi-view'})]);const slots=['Front','Left','Back'].map(label=>el('div','',{},[el('label',label),el('input','',{type:'file',accept:'image/png'})]));const doc=el('body','',{},[el('header','',{},[balance]),generate,multi,...slots]);return {doc,balance,generate,multi,slots};}
test('modeled public UI discovers unique controls and all three upload slots without clicks',()=>{const p=page();assert.equal(D.multi(p.doc).element,p.multi);assert.equal(D.uploads(p.doc,['front','left','back']).errors.length,0);const result=D.controls(p.doc,'generate');assert.equal(result.errors.length,0);assert.equal(result.balance,p.balance);assert.equal(global.TripoWorkflowPolicy.number(D.text(result.quote)),65);assert.equal(p.generate.clicks+p.multi.clicks,0);});
test('missing back slot reports back and never substitutes remaining single input',()=>{const p=page();p.doc.children.pop();assert.match(D.uploads(p.doc,['front','left','back']).errors.join(' '),/back/);const single=el('body','',{},[el('input','',{type:'file'})]);assert.equal(D.uploads(single,['front']).errors.length,0);assert.match(D.uploads(single,['back']).errors.join(' '),/back/);});
test('ambiguous paid buttons, balances and disabled button stop preparation',()=>{const p=page();p.generate.disabled=true;assert.equal(D.controls(p.doc,'generate').errors.length,1);p.generate.disabled=false;p.doc.children.push(el('button','Generate 65'));assert.equal(D.controls(p.doc,'generate').button,null);const q=page();const extra=el('span','900');extra.parentElement=q.doc.children[0];q.doc.children[0].children.push(extra);assert.equal(D.controls(q.doc,'generate').balance,null);});
