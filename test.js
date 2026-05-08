require('dotenv').config();
const { getAIResponse } = require('./utils/groq');
const { formatShelterResponse } = require('./utils/shelterFinder');

const testSakhi = async () => {
  console.log('🌸 Testing Sakhi...\n');

  // Test 1: English help message
  console.log('TEST 1: English support message');
  console.log('User: I am scared, my husband hits me');
  const response1 = await getAIResponse('I am scared, my husband hits me', { state: 'SUPPORT' });
  console.log('Sakhi:', response1);
  console.log('\n---\n');

  // Test 2: Hindi message
  console.log('TEST 2: Hindi message');
  console.log('User: mujhe madad chahiye, pati ne mara');
  const response2 = await getAIResponse('mujhe madad chahiye, pati ne mara', { state: 'SUPPORT' });
  console.log('Sakhi:', response2);
  console.log('\n---\n');

  // Test 3: Shelter finder
  console.log('TEST 3: Shelter finder for Mumbai pincode');
  console.log('User: 400022');
  const response3 = formatShelterResponse('400022');
  console.log('Sakhi:', response3);
  console.log('\n---\n');

  // Test 4: Legal rights
  console.log('TEST 4: Legal rights question');
  console.log('User: What are my legal rights?');
  const response4 = await getAIResponse('What are my legal rights?', { state: 'SUPPORT' });
  console.log('Sakhi:', response4);
  console.log('\n---\n');

  console.log('✅ All tests done!');
};

testSakhi();