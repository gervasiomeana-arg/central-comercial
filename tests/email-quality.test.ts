import test from 'node:test';import assert from 'node:assert/strict';
import {usableContactEmail} from '../src/email-policy.js';
import {reviewContactPage} from '../server/public-web.js';
import {commercialCatalog} from '../server/commercial-catalog.js';
const app=commercialCatalog().find(a=>a.slug.includes('visibility'))!;
test('no confunde ejemplos de formulario con correos institucionales ni bloquea un dominio legítimo completo',()=>{
 for(const email of ['tu@email.com','your@email.com','nombre@dominio.com','email@tuempresa.com','you@example.com','no-reply@agencia.com.ar'])assert.equal(usableContactEmail(email),false,email);
 for(const email of ['hola@seonet.com.ar','tomas@email.com','ventas+argentina@agencia.com.ar'])assert.equal(usableContactEmail(email),true,email);
});
test('regresión en sitio real: input/textarea/atributos no son fuente de email; texto, mailto y esquema sí',()=>{
 const prefix='<title>Agencia digital Argentina</title><h1>Agencia de marketing Argentina</h1>';
 const form='<form><input type="email" placeholder="tu@email.com" value="help@otra-agencia.com.ar"><textarea>ejemplo@correo.com</textarea></form><div data-email="oculto@otra-agencia.com.ar"></div>';
 assert.equal(reviewContactPage(prefix+form,'https://agencia.test/contacto',app,'Argentina').contact,null);
 assert.equal(reviewContactPage(prefix+'<a href="mailto:tu@email.com">Email</a>','https://agencia.test',app,'Argentina').contact,null);
 assert.equal(reviewContactPage(prefix+form+'<a href="mailto:hola@agencia.com.ar">Contacto</a>','https://agencia.test/contacto',app,'Argentina').contact?.email,'hola@agencia.com.ar');
 assert.equal(reviewContactPage(prefix+'<p>Escribinos: contacto@agencia.com.ar</p>','https://agencia.test',app,'Argentina').contact?.email,'contacto@agencia.com.ar');
 assert.equal(reviewContactPage(prefix+'<script type="application/ld+json">{"@type":"Organization","email":"info@agencia.com.ar"}</script>','https://agencia.test',app,'Argentina').contact?.email,'info@agencia.com.ar');
});
