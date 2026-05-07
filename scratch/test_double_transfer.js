
const { getCommuteRoute } = require('./mobile/services/commute');
const { STATIONS } = require('./mobile/data/trainStations');

async function testDoubleTransfer() {
  // Vito Cruz LRT-1
  const from = { latitude: 14.5636, longitude: 120.995 }; 
  // Santolan LRT-2
  const to = { latitude: 14.6223, longitude: 121.0860 };

  console.log('--- Testing Double Transfer: Vito Cruz to Santolan ---');
  try {
    const result = await getCommuteRoute(from, to);
    if (result.type === 'train') {
      result.suggestions.forEach((s, i) => {
        console.log(`\nSuggestion ${i + 1}: ${s.label}`);
        console.log(`Total Duration: ${s.totalDuration} min`);
        console.log(`Total Fare: ₱${s.totalFare}`);
        console.log('Steps:');
        s.steps.forEach(step => {
          console.log(` - [${step.type.toUpperCase()}] ${step.label} (${step.duration} min)`);
        });
      });
    } else {
      console.log('Result type:', result.type);
    }
  } catch (e) {
    console.error('Test failed:', e);
  }
}

testDoubleTransfer();
