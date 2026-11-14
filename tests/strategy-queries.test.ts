import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyQueries} from '../server/intelligence-cycle.js';
import {commercialCatalog} from '../server/commercial-catalog.js';
const neuro=commercialCatalog().find(a=>a.slug.includes('neuro'))!;
const strategy=(searchQueries:string[])=>({segments:[{name:'Centros institucionales',reason:'Acompañamiento adulto'}],searchQueries,campaignAngle:'Actividades',nextSteps:['Verificar fuentes'],ownerQuestions:[]});
test('Neuro acepta centros institucionales pertinentes y país; descarta búsquedas ajenas o particulares',()=>{
 const good='centros de autismo contacto Argentina';
 assert.deepEqual(strategyQueries(strategy([good,'familias autismo Argentina','agencia marketing Argentina','centro autismo Chile']),neuro,'Argentina'),[good]);
 assert.throws(()=>strategyQueries(strategy(['familias autismo Argentina']),neuro,'Argentina'),/institucional/);
 assert.throws(()=>strategyQueries(strategy(['centros autismo Chile']),neuro,'Argentina'),/país/);
});
