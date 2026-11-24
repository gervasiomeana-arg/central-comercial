import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { commercialCatalog } from '../server/commercial-catalog.js';

test('commercial email lifecycle persists attempts, stops repeats, routes verified replies and escalates payment reports',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'central-commercial-email-'));
  try{
    for(const folder of ['server','src','data'])await fs.mkdir(path.join(directory,folder));
    await fs.writeFile(path.join(directory,'package.json'),'{"type":"module"}');
    await fs.symlink(path.resolve('node_modules'),path.join(directory,'node_modules'),'junction');
    for(const name of ['db.ts','data-directory.ts','execution-role.ts','sales-director.ts','commercial-catalog.ts','campaign-preparation.ts','commercial-email.ts','commercial-whatsapp.ts','channelTests.ts','discovery-plan.ts', 'campaign-markets.ts'])await fs.copyFile(new URL(`../server/${name}`,import.meta.url),path.join(directory,'server',name));
    await fs.copyFile(new URL('../src/whatsapp-policy.ts',import.meta.url),path.join(directory,'src','whatsapp-policy.ts'));
    await fs.copyFile(new URL('../src/email-policy.ts',import.meta.url),path.join(directory,'src','email-policy.ts'));
    await fs.copyFile(new URL('../src/ledger.ts',import.meta.url),path.join(directory,'src','ledger.ts'));
    const {db}=await import(pathToFileURL(path.join(directory,'server','db.ts')).href);
    const {claimCommercialEmail,completeCommercialEmail,recordCommercialBounce,importCommercialReply,replyDecision,currentReplyText}=await import(pathToFileURL(path.join(directory,'server','commercial-email.ts')).href);
    const app=db.getApplications().find((a:any)=>/voley/i.test(a.name)), now=new Date();
    db.setAutomationsPaused(false);db.saveMonthlyGoal({...db.getMonthlyGoal(),enabled:true,targetClients:5});
    const campaign=db.getCampaigns().find((c:any)=>c.goalMonth&&c.appId===app.id);campaign.sendWindowStart='00:00';campaign.sendWindowEnd='23:59';campaign.startDate='2026-11-01';
    db.saveContact({id:'research-contact',orgName:'Club prueba',contactPerson:'',role:'Contacto',orgType:'Club',country:'Argentina',language:'es',timezone:'America/Argentina/Buenos_Aires',website:'https://club.test',email:'info@club.test',phone:'',source:'https://club.test/contacto',sourceReviewDate:new Date(now.getTime()-1000).toISOString(),interestedAppIds:[app.id],assignedTo:'',notes:'',history:[],preferredChannel:'email',permission:'desconocido',outreachBasis:'public_business_contact',status:'prospecto',nextFollowUpDate:null,createdAt:now.toISOString(),updatedAt:now.toISOString()});
    db.prepareCampaignDrafts(campaign.id);db.commercialEmailHeartbeat('test-worker',true,true,'owner@test.org');
    assert.throws(()=>claimCommercialEmail('another-worker'));
    const originalContact=db.getContactById('research-contact');db.saveContact({...originalContact,email:'tu@email.com'});
    assert.equal(claimCommercialEmail('test-worker',now),null,'Existing prepared drafts cannot be sent to form examples');
    db.saveContact({...originalContact,email:'info@club.test'});
    const job=claimCommercialEmail('test-worker',now);assert.ok(job);assert.equal(job.recipient,'info@club.test');
    assert.equal(claimCommercialEmail('test-worker',now),null,'never leases same draft twice');
    assert.throws(()=>completeCommercialEmail({...job,workerId:'test-worker',lease:'wrong',outcome:'accepted',response:'250 OK'}));
    completeCommercialEmail({...job,workerId:'test-worker',outcome:'accepted',response:'250 OK',providerMessageId:job.providerMessageId});
    const conv=db.getConversationById(job.conversationId);assert.equal(conv.messages[0].status,'aceptado_proveedor');assert.equal(conv.messages[0].deliveredAt,undefined);assert.equal(db.getContactById('research-contact').history.filter((h:any)=>h.type==='mensaje_enviado').length,1);
    completeCommercialEmail({...job,workerId:'test-worker',outcome:'accepted',response:'250 OK'});assert.equal(db.getContactById('research-contact').history.filter((h:any)=>h.type==='mensaje_enviado').length,1);
    assert.throws(()=>importCommercialReply({messageId:'<bad@test>',from:'other@test.org',references:[job.providerMessageId],text:'precio'}));
    const incoming={messageId:'<reply1@test>',from:'info@club.test',references:[job.providerMessageId],text:'Quisiera información y una demo.\nOn Thu, Sender wrote:\n> responder BAJA'};
    importCommercialReply(incoming);assert.equal(db.getContactById('research-contact').permission,'desconocido');assert.equal(conv.messages.filter((m:any)=>m.replyToProviderId==='<reply1@test>').length,1);
    importCommercialReply(incoming);assert.equal(conv.messages.filter((m:any)=>m.providerMessageId==='<reply1@test>').length,1);
    assert.equal(currentReplyText('precio\n> BAJA'),'precio');
    const answer=claimCommercialEmail('test-worker',now);assert.ok(answer?.inReplyTo);
    completeCommercialEmail({...answer,workerId:'test-worker',outcome:'unknown',response:'timeout'});assert.equal(claimCommercialEmail('test-worker',now),null,'unknown outcomes never resend');
    importCommercialReply({messageId:'<payment@test>',from:'info@club.test',references:[job.providerMessageId],text:'Ya pagué, adjunto comprobante.'});
    assert.ok(db.getTasks().some((t:any)=>t.relatedId===conv.id&&t.status==='pendiente'));assert.equal(db.getPayments().filter((p:any)=>p.status==='confirmado').length,0);assert.equal(db.getSalesGoalReport().achieved,0);
    importCommercialReply({messageId:'<stop@test>',from:'info@club.test',references:[job.providerMessageId],text:'BAJA'});assert.equal(db.getContactById('research-contact').permission,'revocado');assert.equal(claimCommercialEmail('test-worker',now),null);
    assert.equal(recordCommercialBounce({ references: [job.providerMessageId], recipient: 'other@club.test', status: '5.1.1' }).matched, false);
    assert.equal(recordCommercialBounce({ references: [job.providerMessageId], recipient: job.recipient, status: '4.2.2' }).matched, false);
    const bounce = { references: [job.providerMessageId], recipient: job.recipient, status: '5.1.1' };
    assert.equal(recordCommercialBounce(bounce).matched, true);
    assert.equal(conv.messages.find((m:any) => m.id === job.messageId).status, 'fallido');
    assert.equal(db.getContactById('research-contact').undeliverableEmail, job.recipient);
    assert.equal(recordCommercialBounce(bounce).matched, false);

    assert.equal(replyDecision('Quiero un descuento',app,'Argentina').kind,'human');assert.equal(replyDecision('precio',app,'Brasil').kind,'human');
    assert.equal(replyDecision('Quiero contratar',app,'Argentina').kind,'purchase');
    assert.ok(!replyDecision('precio',commercialCatalog()[2],'Argentina').text?.includes('99'));

    const oldLocalMode = process.env.CENTRAL_LOCAL_MODE;
    process.env.CENTRAL_LOCAL_MODE = 'true';
    try {
      db.saveMonthlyGoal({...db.getMonthlyGoal(),dailyEmailLimit:1});
      db.startMonthlyDirector();
      const {accountingDay} = await import(pathToFileURL(path.join(directory,'src','ledger.ts')).href);
      const early = new Date(`${accountingDay(now)}T08:00:00Z`);
      const reviewed = new Date(early.getTime() - 86400000).toISOString();
      db.saveContact({
        ...originalContact, id:'fallback-contact', orgName:'Club canal alternativo', email:'fallback@club.test',
        phone:'+54 911 5555-1234', permission:'autorizado', sourceReviewDate:reviewed,
        whatsappConsent:{granted:true,evidence:'Pidió promociones por WhatsApp',at:reviewed}
      });
      assert.equal(campaign.dailyLimit,0);
      db.prepareCampaignDrafts(campaign.id);
      const firstAttempt = claimCommercialEmail('test-worker',early);
      assert.ok(firstAttempt, 'director claims promotions beyond the internal daily limit and outside the former send window');
      assert.equal(firstAttempt.recipient,'fallback@club.test');
      completeCommercialEmail({...firstAttempt,workerId:'test-worker',outcome:'rejected',response:'550 5.1.1 Unknown mailbox'});
      db.prepareCampaignDrafts(campaign.id);
      db.prepareCampaignDrafts(campaign.id);

      const {TEST_RECIPIENTS} = await import(pathToFileURL(path.join(directory,'server','channelTests.ts')).href);
      const {claimWhatsApp,completeWhatsApp,whatsappHeartbeat} = await import(pathToFileURL(path.join(directory,'server','commercial-whatsapp.ts')).href);
      whatsappHeartbeat('test-wa',true,TEST_RECIPIENTS.whatsapp);
      const whatsappJob = claimWhatsApp('test-wa',early);
      assert.ok(whatsappJob);
      assert.equal(whatsappJob.recipient,'5491155551234');
      const oldEmail = db.getConversationById(firstAttempt.conversationId).messages[0];
      assert.equal(oldEmail.status,'fallido');
      assert.equal(oldEmail.replacementMessageId,whatsappJob.messageId);
      assert.equal(claimWhatsApp('test-wa',early),null,'only one WhatsApp promotion is queued');

      const requestPhone = '+5491155556789';
      db.saveContact({...originalContact,id:'whatsapp-request',email:'request@club.test',phone:'',
        permission:'desconocido',preferredChannel:'email',status:'prospecto',sourceReviewDate:reviewed,
        history:[],whatsappConsent:undefined});
      db.prepareCampaignDrafts(campaign.id);
      const invitation = claimCommercialEmail('test-worker',early);
      assert.ok(invitation?.content.includes('WHATSAPP OK'));
      completeCommercialEmail({...invitation,workerId:'test-worker',outcome:'accepted',response:'250 OK'});
      const acceptance = {messageId:'<consent@test>',from:'request@club.test',
        references:[invitation.providerMessageId],text:`WHATSAPP OK ${requestPhone}`};
      assert.throws(()=>importCommercialReply({...acceptance,from:'someone-else@club.test'}));
      assert.equal(db.getContactById('whatsapp-request').whatsappConsent,undefined);
      assert.equal(importCommercialReply(acceptance).decision,'whatsapp_opt_in');
      assert.equal(importCommercialReply(acceptance).duplicate,true);
      const lead = db.getContactById('whatsapp-request');
      assert.equal(lead.whatsappConsent.granted,true);
      assert.equal(lead.permission,'desconocido');
      const requested = claimWhatsApp('test-wa',new Date());
      assert.equal(requested?.recipient,requestPhone.slice(1));
      assert.ok(!requested?.content.includes('WHATSAPP OK'));
      assert.equal(claimWhatsApp('test-wa',new Date()),null);

      db.startMonthlyDirector('whatsapp');
      db.saveContact({
        ...originalContact, id:'whatsapp-first', email:'alternate@club.test', phone:'+5491155559876',
        permission:'autorizado', sourceReviewDate:reviewed, history:[],
        whatsappConsent:{granted:true,evidence:'Pidió promociones por WhatsApp',at:reviewed},
      });
      db.prepareCampaignDrafts(campaign.id);
      const whatsappFirst = claimWhatsApp('test-wa',new Date());
      assert.equal(whatsappFirst?.recipient,'5491155559876');
      completeWhatsApp({...whatsappFirst,workerId:'test-wa',outcome:'rejected'});
      db.prepareCampaignDrafts(campaign.id);
      db.prepareCampaignDrafts(campaign.id);
      const alternate = claimCommercialEmail('test-worker',new Date());
      assert.equal(alternate?.recipient,'alternate@club.test');
      assert.equal(db.getConversationById(whatsappFirst!.conversationId).messages[0].replacementMessageId,alternate?.messageId);
      assert.equal(claimCommercialEmail('test-worker',new Date()),null);
      completeCommercialEmail({...alternate,workerId:'test-worker',outcome:'rejected',response:'550 5.1.1 Unknown mailbox'});
      db.prepareCampaignDrafts(campaign.id);
      assert.equal(claimWhatsApp('test-wa',new Date()),null,'a failed fallback never switches back to the original channel');
    } finally {
      if (oldLocalMode === undefined) delete process.env.CENTRAL_LOCAL_MODE;
      else process.env.CENTRAL_LOCAL_MODE = oldLocalMode;
    }
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('recupera avisos de Gmail sin parte DSN y conserva el diagnóstico real', async () => {
  const {collectBounces} = await import('../email-worker/journal.mjs');
  const recipient = 'contacto@institucion.test';
  const id = '<cc-prueba@sender.test>';
  const threads = [{ id, from: recipient }];
  const mail = {
    attachments:[{contentType:'message/delivery-status',content:Buffer.from('')},
      {contentType:'text/rfc822-headers',content:Buffer.from(`Message-ID: ${id}\r\n`)}],
    text:`** Address not found **\r\n\r\nYour message wasn't delivered to ${recipient} because the address couldn't be found.\r\n\r\nThe response from the remote server was:\r\n550 5.7.1 Recipient address rejected: User unknown in local recipient table`,
  };
  assert.deepEqual(collectBounces(mail, '', threads, 'mailer-daemon@googlemail.com'), [{
    recipient, status:'5.7.1', references:[id], diagnostic:'550 5.7.1 Recipient address rejected: User unknown in local recipient table',
  }]);
  assert.deepEqual(collectBounces(mail, '', threads, 'unknown@other.test'), []);
  assert.deepEqual(collectBounces(mail, '', [{id,from:'other@institucion.test'}], 'mailer-daemon@googlemail.com'), []);
  assert.deepEqual(collectBounces({...mail,text:mail.text.replace('550 5.7.1','450 4.7.1')}, '', threads, 'mailer-daemon@googlemail.com'), []);
});

test('pone en pausa nuevas promociones tras fallos confirmados a cinco destinatarios distintos', async () => {
  const {emailPromotionHold} = await import('../src/email-policy.js');
  const now = Date.parse('2026-11-24T14:30:00Z');
  const failed = Array.from({length:5},(_,i)=>({
    channel:'email', direction:'outbound', status:'fallido', approvedRecipient:`contact-${i}@institucion.test`,
    emailFailureAt:new Date(now-(i+1)*60000).toISOString(),
  })) as Parameters<typeof emailPromotionHold>[0];
  assert.equal(emailPromotionHold(failed,now),now+55*60000);
  assert.equal(emailPromotionHold([...failed.slice(0,4),failed[0]],now),undefined);
  assert.equal(emailPromotionHold(failed.map((m,i)=>i===0?{...m,replyToProviderId:'reply'}:m),now),undefined);
  assert.equal(emailPromotionHold(failed,now+55*60000),undefined);
});
