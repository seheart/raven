/**
 * Example JavaScript file for testing Raven monitoring
 */

function helloWorld() {
  console.log('Hello from Raven test workspace!');
}

function calculateSum(a, b) {
  return a + b;
}

// Main execution
helloWorld();
const result = calculateSum(5, 3);
console.log(`Sum: ${result}`);

export { helloWorld, calculateSum };
