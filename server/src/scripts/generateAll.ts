import fs from 'fs';
import path from 'path';
import { createRepository } from '../repository/index.js';
import { GeminiClient } from '../geminiClient/index.js';
import { GenerationService } from '../generationService/index.js';
import { CONCEPTS } from '../concepts/index.js';

async function main() {
  console.log('=== Starting Real Generation for All 5 Concepts ===');
  const repository = createRepository();
  await repository.init();

  const geminiClient = new GeminiClient();
  const generationService = new GenerationService(geminiClient, repository);

  const results = [];

  for (const concept of CONCEPTS) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Generating Concept ${concept.number}: ${concept.name} (${concept.id})...`);
    try {
      const { result, review } = await generationService.generate(concept.id);
      results.push(result);
      console.log(`✓ Result for ${concept.name}:`);
      console.log(`  Model: ${result.usage.model}`);
      console.log(`  Tokens: in=${result.usage.inputTokens}, out=${result.usage.outputTokens}`);
      console.log(`  Estimated Cost: $${result.usage.estimatedCostUsd}`);
      console.log(`  Retries: total=${result.retryCount} (validation=${result.validationRetryCount}, api=${result.apiRetryCount})`);
      console.log(`  Checks:`);
      for (const [k, v] of Object.entries(result.checks)) {
        console.log(`    - ${k}: ${v.passed ? 'PASSED' : 'FAILED'} (${v.reason})`);
      }
    } catch (err: any) {
      console.error(`✗ Error generating ${concept.name}:`, err.message);
    }
  }

  // Export to root results.json
  const rootResultsPath = path.resolve(process.cwd(), '..', 'results.json');
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    results
  };

  fs.writeFileSync(rootResultsPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\n==================================================`);
  console.log(`Exported ${results.length} genuine DiagramResult objects to ${rootResultsPath}`);

  await repository.close();
}

main().catch(err => {
  console.error('Fatal generation script error:', err);
  process.exit(1);
});
