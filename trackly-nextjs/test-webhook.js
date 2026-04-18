#!/usr/bin/env node
/**
 * Webhook Test Script - run from DigitalOcean App Platform console
 *
 * Usage:
 *   node test-webhook.js
 *
 * Sends a signed Standard Webhooks test event to the local webhook
 * endpoint. Uses a non-existent event type "test.ping" that the
 * handler will accept (signature valid, idempotency recorded) but
 * won't modify any user data since it doesn't match UPGRADE_EVENTS
 * or DOWNGRADE_EVENTS.
 */
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.DODO_PAYMENTS_WEBHOOK_KEY || process.env.DODO_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('ERROR: No webhook secret found in environment.');
  console.error('Checked: DODO_PAYMENTS_WEBHOOK_KEY, DODO_WEBHOOK_SECRET');
  process.exit(1);
}

console.log('Webhook secret found:', WEBHOOK_SECRET.substring(0, 8) + '...');

// Build a safe test payload that won't modify any data
const payload = JSON.stringify({
  type: 'test.ping',
  business_id: 'test_business',
  timestamp: new Date().toISOString(),
  data: {
    message: 'Webhook connectivity test',
    test: true,
  },
});

// Standard Webhooks signing
const webhookId = 'msg_test_' + Date.now();
const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

// Handle whsec_ prefix (Standard Webhooks convention)
let keyBytes;
if (WEBHOOK_SECRET.startsWith('whsec_')) {
  keyBytes = Buffer.from(WEBHOOK_SECRET.slice(6), 'base64');
  console.log('Using whsec_ prefixed secret (base64 decoded)');
} else {
  keyBytes = Buffer.from(WEBHOOK_SECRET, 'utf8');
  console.log('Using raw secret');
}

const signature = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');
const signatureHeader = `v1,${signature}`;

console.log('\n--- Request ---');
console.log('URL: http://localhost:8080/api/payments/webhooks/dodopayments');
console.log('webhook-id:', webhookId);
console.log('webhook-timestamp:', webhookTimestamp);
console.log('webhook-signature:', signatureHeader);
console.log('Body:', payload);

// Send to localhost (within the same container)
const url = `http://localhost:${process.env.PORT || 8080}/api/payments/webhooks/dodopayments`;

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'webhook-id': webhookId,
    'webhook-timestamp': webhookTimestamp,
    'webhook-signature': signatureHeader,
  },
  body: payload,
})
  .then(async (res) => {
    const text = await res.text();
    console.log('\n--- Response ---');
    console.log('Status:', res.status);
    console.log('Body:', text);

    if (res.status === 200) {
      console.log('\n✓ SUCCESS - Webhook endpoint is live and signature verification works!');
    } else if (res.status === 401 && text.includes('Invalid signature')) {
      console.log('\n✗ SIGNATURE MISMATCH - The secret in env vars does not match what the handler expects.');
      console.log('  Check that DODO_PAYMENTS_WEBHOOK_KEY matches the signing key in DodoPayments dashboard.');
    } else if (res.status === 401 && text.includes('Missing signature')) {
      console.log('\n✗ HEADERS NOT RECEIVED - The signature headers are being stripped.');
    } else if (res.status === 500) {
      console.log('\n✗ SERVER ERROR - Check runtime logs for [Webhook] error details.');
    } else {
      console.log('\n? UNEXPECTED - Check runtime logs for details.');
    }
  })
  .catch((err) => {
    console.error('\n✗ CONNECTION FAILED:', err.message);
    console.error('  The app might not be listening on localhost. Try port 3000 or 8080.');
  });
