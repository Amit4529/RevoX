import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const accountSid = env.TWILIO_ACCOUNT_SID;
const authToken = env.TWILIO_AUTH_TOKEN;
const fromNumber = env.TWILIO_FROM_NUMBER;
const toNumber = env.VOICE_TEST_TO_NUMBER;

console.log('Testing Twilio with:', { accountSid, fromNumber, toNumber, authTokenLength: authToken?.length });

async function testCall() {
  const params = new URLSearchParams();
  params.append('To', toNumber);
  params.append('From', fromNumber);
  params.append('Url', 'http://demo.twilio.com/docs/voice.xml');

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Twilio Response:', JSON.stringify(data, null, 2));
}

testCall();
